export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", width: "100%" }}>
      {children}
    </div>
  );
}
