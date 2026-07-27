import { Bouncy } from 'ldrs/react';
import 'ldrs/react/Bouncy.css';
import { BrandMarkIcon } from './icons.jsx';

// Same icon as the sidebar/verify-page brand mark (see icons.jsx) - the
// assistant's identity here is "the app itself replying," not a separate
// named persona, so it reuses that mark rather than a distinct one.
function AssistantAvatar() {
  return (
    <span className="msg-avatar" aria-hidden="true">
      <BrandMarkIcon width="14" height="14" />
    </span>
  );
}

export function MessageBubble({ role, content, variant }) {
  const className = variant ? `msg ${role} ${variant}` : `msg ${role}`;
  const bubble = <div className={className}>{content}</div>;

  // Only assistant replies get an avatar - user bubbles are already
  // self-explanatory (right-aligned, solid brand color) without one, the
  // same asymmetry most chat products use.
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
        {/* color is a CSS custom property (--color-text-muted), not a
            literal value - Bouncy just forwards it straight into its own
            --uib-color custom property, so this stays correct in both
            themes for free instead of needing a light/dark pair hardcoded
            here. */}
        <span className="typing-indicator">
          <Bouncy size="28" speed="1.4" color="var(--color-text-muted)" />
        </span>
      </div>
    </div>
  );
}
