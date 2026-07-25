export function MessageBubble({ role, content, variant }) {
  const className = variant ? `msg ${role} ${variant}` : `msg ${role}`;
  return <div className={className}>{content}</div>;
}

export function TypingIndicator() {
  return (
    <div className="msg assistant pending" aria-label="Assistant is typing">
      <span className="typing-dot"></span>
      <span className="typing-dot"></span>
      <span className="typing-dot"></span>
    </div>
  );
}
