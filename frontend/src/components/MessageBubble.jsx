import { Bouncy } from 'ldrs/react';
import 'ldrs/react/Bouncy.css';
import { SparkleIcon } from './icons.jsx';

function AssistantAvatar() {
  return (
    <span className="msg-avatar" aria-hidden="true">
      <SparkleIcon width="14" height="14" />
    </span>
  );
}

export function MessageBubble({ role, content, variant }) {
  const className = variant ? `msg ${role} ${variant}` : `msg ${role}`;
  const bubble = <div className={className}>{content}</div>;

  if (role !== 'assistant') return bubble;

  return (
    <div className="msg-row">
      <AssistantAvatar />
      {bubble}
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="msg-row">
      <AssistantAvatar />
      <div className="msg assistant pending" aria-label="Assistant is typing">
        {}
        <span className="typing-indicator">
          <Bouncy size="28" speed="1.4" color="var(--color-text-muted)" />
        </span>
      </div>
    </div>
  );
}
