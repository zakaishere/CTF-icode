interface FieldErrorProps {
  errors:    Record<string, string>;
  fieldName: string;
}

export function FieldError({ errors, fieldName }: FieldErrorProps) {
  const message = errors[fieldName];
  if (!message) return null;
  return (
    <p style={{ color: "#de350b", fontSize: 11, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
      <span>⚠</span>
      {message}
    </p>
  );
}
