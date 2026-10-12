-- Deterministic bot (see MIGRATION_NOTES.md): aliases, FAQ keywords / intent keys / French answers,
-- customer language, per-message layer, LLM call log, per-turn log, FTS function, indexes.

-- Locations: alternative names the bot matches ("airport", "SSR", "grand bay").
alter table locations add column if not exists aliases text[] not null default '{}';
comment on column locations.aliases is
  'Alternative names customers use. The bot matches a message against name + aliases (lib/bot/parsers/location.ts).';

-- Knowledge base: keyword rules, an intent key the bot routes on, and French text.
alter table knowledge_base
  add column if not exists keywords text[] not null default '{}',
  add column if not exists intent_key text,
  add column if not exists question_fr text,
  add column if not exists answer_fr text;
comment on column knowledge_base.keywords is
  'Extra trigger phrases (any language). A message containing one gets this entry''s answer verbatim.';
comment on column knowledge_base.intent_key is
  'Built-in FAQ intent: opening_hours, payment_methods, documents_required, fuel, mileage, cancellation, late_return, deposit, address.';
create index if not exists knowledge_base_intent_idx on knowledge_base (intent_key) where intent_key is not null;

-- Customers: language detected from their messages (English or French).
alter table customers
  add column if not exists preferred_language text check (preferred_language in ('en', 'fr'));

-- Messages: which layer produced an outbound message, and whether the text came from the optional model.
alter table messages
  add column if not exists handled_by text
    check (handled_by in ('button', 'command', 'state_machine', 'faq', 'existing_booking', 'llm_fallback', 'human')),
  add column if not exists generated_by text check (generated_by in ('llm'));
create index if not exists messages_handled_by_idx on messages (handled_by, created_at);

-- Every call to a language model (the optional fallback; also used by owner "Summarise / Suggest" buttons).
create table if not exists llm_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations (id) on delete set null,
  customer_id uuid references customers (id) on delete set null,
  message_id text,
  purpose text not null check (purpose in ('classify', 'kb_answer', 'doc_extraction', 'owner_summary', 'owner_suggest')),
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table llm_calls is 'One row per model request. Drives the per-conversation / per-customer daily caps and the analytics page.';
create index if not exists llm_calls_conversation_idx on llm_calls (conversation_id, created_at);
create index if not exists llm_calls_customer_idx on llm_calls (customer_id, created_at);
create index if not exists llm_calls_created_idx on llm_calls (created_at);

-- One row per customer message the bot handled: which layer, how long, what was parsed.
create table if not exists bot_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  message_id text,
  layer text not null check (layer in ('button', 'command', 'state_machine', 'faq', 'existing_booking', 'llm_fallback', 'human')),
  matched text,
  step text,
  next_step text,
  total_ms integer not null default 0,
  db_ms integer not null default 0,
  llm_ms integer not null default 0,
  llm_calls integer not null default 0,
  unrecognised boolean not null default false,
  inbound_text text,
  parsed jsonb,
  booking_id uuid references bookings (id) on delete set null,
  booking_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);
comment on column bot_turns.inbound_text is 'Only stored when the bot did not understand the message (so rules can be added); null otherwise.';
create index if not exists bot_turns_created_idx on bot_turns (created_at);
create index if not exists bot_turns_conversation_idx on bot_turns (conversation_id, created_at);
create index if not exists bot_turns_unrecognised_idx on bot_turns (created_at) where unrecognised;
create index if not exists bot_turns_booking_idx on bot_turns (booking_id) where booking_id is not null;

do $$
declare
  t text;
begin
  foreach t in array array['llm_calls', 'bot_turns'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('revoke all on %I from authenticated', t);
    execute format('grant select on %I to authenticated', t);
    execute format(
      'create policy staff_select on %I for select to authenticated using (is_active_staff())', t
    );
  end loop;
end $$;

-- Ranked FAQ search. Score is normalised to 0..1 (ts_rank_cd divided by itself + 1) and any
-- matching word counts, so a long question still finds the entry. English uses the stored
-- search_vector; French searches question_fr / answer_fr and falls back to the English text.
create or replace function search_knowledge(q text, lang text, lim integer default 5)
returns table (id uuid, score real)
language plpgsql
stable
as $$
declare
  words text[];
  tsq_en tsquery;
  tsq_fr tsquery;
begin
  select coalesce(array_agg(w), '{}') into words
  from regexp_split_to_table(lower(regexp_replace(coalesce(q, ''), '[^[:alnum:]\s]', ' ', 'g')), '\s+') as w
  where length(w) > 2;

  if coalesce(array_length(words, 1), 0) = 0 then
    return;
  end if;

  tsq_en := to_tsquery('english', (select string_agg(quote_literal(w), ' | ') from unnest(words) as w));
  tsq_fr := to_tsquery('french', (select string_agg(quote_literal(w), ' | ') from unnest(words) as w));

  return query
    select k.id,
           greatest(
             case when lang = 'fr' then 0 else ts_rank_cd(k.search_vector, tsq_en, 32) end,
             case when lang = 'fr' then ts_rank_cd(
                 to_tsvector('french', coalesce(k.question_fr, k.question) || ' ' || coalesce(k.answer_fr, k.answer)),
                 tsq_fr, 32) else 0 end
           )::real as score
    from knowledge_base k
    where k.active
      and (
        (lang <> 'fr' and k.search_vector @@ tsq_en)
        or (lang = 'fr' and to_tsvector('french', coalesce(k.question_fr, k.question) || ' ' || coalesce(k.answer_fr, k.answer)) @@ tsq_fr)
      )
    order by 2 desc
    limit greatest(lim, 1);
end;
$$;
revoke all on function search_knowledge(text, text, integer) from public, anon, authenticated;
grant execute on function search_knowledge(text, text, integer) to service_role;

-- ---------------------------------------------------------------------
-- Data for the seeded fleet / knowledge base (idempotent; mirrored in seed.sql)
-- ---------------------------------------------------------------------
update locations set aliases = case name
  when 'SSR International Airport' then array['airport', 'SSR', 'aeroport', 'aéroport', 'plaisance', 'mahebourg airport']
  when 'Grand Baie' then array['grand bay', 'grandbaie', 'grand-baie', 'gba']
  when 'Port Louis' then array['portlouis', 'port-louis', 'capital', 'caudan']
  when 'Flic-en-Flac' then array['flic en flac', 'flic', 'fef']
  when 'Quatre Bornes' then array['quatre-bornes', 'q bornes', 'qb']
  when 'Tamarin' then array['tamarin bay']
  else aliases end
where aliases = '{}';

update knowledge_base k set
  intent_key = v.intent_key,
  keywords = v.keywords,
  question_fr = v.question_fr,
  answer_fr = v.answer_fr
from (values
  ('What are your opening hours?', 'opening_hours', array['opening hours', 'horaires']::text[],
   'Quels sont vos horaires d''ouverture ?',
   'La plupart de nos agences sont ouvertes de 08h00 à 18h00 du lundi au samedi, avec des horaires réduits le dimanche. Le comptoir de l''aéroport est ouvert de 06h00 à 22h00 tous les jours. Les horaires exacts dépendent du lieu de prise en charge.'),
  ('How do I pay?', 'payment_methods', array['how do i pay', 'comment payer']::text[],
   'Comment payer ?',
   'Le paiement se fait uniquement en espèces, en roupies mauriciennes (Rs), à la remise du véhicule. Nous n''acceptons ni paiement par carte ni acompte à l''avance.'),
  ('Can I pay by card or bank transfer?', 'payment_methods', array['pay by card', 'bank transfer', 'credit card', 'carte bancaire']::text[],
   'Puis-je payer par carte ou virement ?',
   'Pas pour le moment — nous acceptons uniquement les espèces, payées à la prise en charge. Si c''est difficile pour vous, dites-le-nous et un membre de l''équipe vous aidera.'),
  ('What do I need to rent a car?', 'documents_required', array['what do i need', 'documents required', 'quels documents']::text[],
   'De quoi ai-je besoin pour louer une voiture ?',
   'Un passeport ou une carte d''identité valide, un permis de conduire détenu depuis au moins 1 an, et avoir au moins 21 ans. Vous enverrez des photos de vos documents via un lien sécurisé après la réservation.'),
  ('Can I rent if I''m under 21?', null, array['under 21', 'moins de 21 ans']::text[],
   'Puis-je louer si j''ai moins de 21 ans ?',
   'Notre âge minimum standard est de 21 ans. Si vous êtes plus jeune, écrivez-nous et nous verrons ce qui est possible avec vos documents.'),
  ('What is the fuel policy?', 'fuel', array['fuel policy']::text[],
   'Quelle est la politique carburant ?',
   'Les véhicules sont fournis avec le plein et doivent être rendus pleins. Si le niveau est inférieur, des frais de ravitaillement s''appliquent.'),
  ('Is there a mileage limit?', 'mileage', array['mileage limit', 'unlimited mileage']::text[],
   'Y a-t-il une limite de kilométrage ?',
   'Nos locations incluent un kilométrage illimité sur l''île — roulez autant que vous voulez.'),
  ('What is your cancellation policy?', 'cancellation', array['cancellation policy']::text[],
   'Quelle est votre politique d''annulation ?',
   'Vous pouvez annuler gratuitement jusqu''à 24 heures avant la prise en charge. Une annulation plus tardive ou une absence peut entraîner des frais — demandez-nous les détails pour votre réservation.'),
  ('What happens if I return the car late?', 'late_return', array['return late', 'late fee']::text[],
   'Que se passe-t-il si je rends la voiture en retard ?',
   'Un court délai de grâce est toléré. Au-delà, des frais de retard s''appliquent par heure ou par jour supplémentaire. Prévenez-nous le plus tôt possible si vous pensez être en retard.'),
  ('Why do you need my passport and licence?', null, array['why passport']::text[],
   'Pourquoi avez-vous besoin de mon passeport et de mon permis ?',
   'La réglementation mauricienne sur la location nous oblige à vérifier l''identité et le permis de chaque locataire. Vos documents sont stockés de manière sécurisée et utilisés uniquement à cette fin.'),
  ('Is my document upload secure?', null, array['upload secure']::text[],
   'Mon envoi de documents est-il sécurisé ?',
   'Oui — l''envoi passe par un lien privé et chiffré lié uniquement à votre réservation, et les documents sont conservés dans un espace privé accessible uniquement au personnel autorisé.'),
  ('Do you offer child seats?', null, array['child seat', 'baby seat', 'siège enfant']::text[],
   'Proposez-vous des sièges enfant ?',
   'Oui, des sièges enfant sont disponibles sur demande — dites-le-nous lors de la réservation pour que nous en réservions un.'),
  ('Can I add an additional driver?', null, array['additional driver', 'second driver', 'conducteur supplémentaire']::text[],
   'Puis-je ajouter un conducteur supplémentaire ?',
   'Oui, un conducteur supplémentaire peut être ajouté — il devra aussi fournir un permis de conduire valide pour vérification.'),
  ('Is insurance included?', 'deposit', array['insurance']::text[],
   'L''assurance est-elle incluse ?',
   'Oui, toutes les locations incluent une assurance de base. Renseignez-vous sur le montant de la franchise et les options de couverture pour votre véhicule.'),
  ('What if the car breaks down?', null, array['break down', 'breaks down']::text[],
   'Que faire si la voiture tombe en panne ?',
   'Écrivez-nous immédiatement sur WhatsApp ou appelez le numéro indiqué dans votre confirmation — nous organiserons une assistance ou un véhicule de remplacement au plus vite.')
) as v(question, intent_key, keywords, question_fr, answer_fr)
where k.question = v.question and k.answer_fr is null;
