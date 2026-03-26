interface ErrorMessageProps {
  error: string | null;
  onDismiss: () => void;
}

export function ErrorMessage({ error, onDismiss }: ErrorMessageProps) {
  if (!error) return null;

  return (
    <div className="error-banner" role="alert">
      <span className="error-text">{error}</span>
      <button onClick={onDismiss} className="error-close" aria-label="关闭错误提示">
        ×
      </button>
    </div>
  );
}
