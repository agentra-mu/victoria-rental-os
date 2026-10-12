export default function DashboardRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="dash min-h-screen">{children}</div>;
}
