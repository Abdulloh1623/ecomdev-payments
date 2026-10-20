export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button className="btn ghost small" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}
