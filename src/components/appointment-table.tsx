export function AppointmentTable({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">{children}</div>
  );
}
