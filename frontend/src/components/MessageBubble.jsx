import { Bouncy } from 'ldrs/react';
import 'ldrs/react/Bouncy.css';

export function MessageBubble({ role, content, variant }) {
  const className = variant ? `msg ${role} ${variant}` : `msg ${role}`;
  return <div className={className}>{content}</div>;
}

export function TypingIndicator() {
  return (
    <div className="msg assistant pending" aria-label="Assistant is typing">
      {/* color is a CSS custom property (--color-text-muted), not a literal
          value - Bouncy just forwards it straight into its own --uib-color
          custom property, so this stays correct in both themes for free
          instead of needing a light/dark pair hardcoded here. */}
      <span className="typing-indicator">
        <Bouncy size="28" speed="1.4" color="var(--color-text-muted)" />
      </span>
    </div>
  );
}
