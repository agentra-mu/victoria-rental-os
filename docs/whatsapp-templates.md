# WhatsApp templates to submit to Meta

Messages sent outside the 24-hour customer-service window must use an approved
template. Submit these (category **UTILITY**, language `en`; add `fr` versions if
customers use French). After approval, register each in the dashboard under
**Settings → Quick replies & templates** (`kind` → template name, language,
parameter order). If no template is registered for a `kind`, the cron sends plain
text instead (works only while the window is open).

| kind              | Suggested template name | Body                                                                                                                                                          | Parameters (in order)                           |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `pickup_reminder` | `pickup_reminder`       | Hi {{1}}, a reminder that your {{2}} (booking #{{3}}) is ready for pickup tomorrow at {{4}}. Please bring your passport, driving permit and Rs {{5}} in cash. | `["name","vehicle","booking","pickup","total"]` |
| `pickup_day`      | `pickup_today`          | Hi {{1}}, your pickup is at {{2}} — {{3}}. {{4}} See you soon!                                                                                                | `["name","pickup","location","instructions"]`   |
| `return_reminder` | `return_reminder`       | Good morning {{1}}, your {{2}} is due back today at {{3}}. If you're running late, just reply here.                                                           | `["name","vehicle","ret"]`                      |
| `thank_you`       | `thank_you`             | Thank you for renting with Victoria Car Rental, {{1}}! We hope to see you again.                                                                              | `["name"]`                                      |
| `docs_nudge_1`    | `documents_reminder`    | Hi {{1}}, we're still waiting for your passport and driving permit for booking #{{2}}. Reply here if you need a new upload link.                              | `["name","booking"]`                            |
| `docs_nudge_2`    | `documents_reminder_2`  | Hi {{1}}, a final reminder: we still need your documents for booking #{{2}} to keep your car reserved.                                                        | `["name","booking"]`                            |
| `reopen`          | `reopen_conversation`   | Hello from Victoria Car Rental — we have an update about your booking. Please reply to this message so we can continue.                                       | `[]`                                            |

Parameter names map to the fields the cron fills in: `name`, `booking`, `vehicle`,
`pickup`, `ret`, `location`, `instructions`, `total`.

The owner digest and the "customer hasn't uploaded documents" alert go to the
dashboard (and the owner's WhatsApp while their window is open); they need no
customer template. For the owner's phone to receive the digest outside the window,
register a `reopen`-style template for it as well.
