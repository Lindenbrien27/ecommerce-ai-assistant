import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble, TypingIndicator } from './MessageBubble.jsx';

describe('MessageBubble', () => {
  it('renders the message content', () => {
    render(<MessageBubble role="user" content="Where's my order?" />);
    expect(screen.getByText("Where's my order?")).toBeInTheDocument();
  });

  it('applies the role as a class with no variant', () => {
    render(<MessageBubble role="assistant" content="Hi there" />);
    expect(screen.getByText('Hi there')).toHaveClass('msg', 'assistant');
  });

  it('applies both role and variant as classes when a variant is given', () => {
    render(<MessageBubble role="assistant" content="Something went wrong" variant="error" />);
    expect(screen.getByText('Something went wrong')).toHaveClass('msg', 'assistant', 'error');
  });
});

describe('TypingIndicator', () => {
  it('renders a loading animation', () => {
    const { container } = render(<TypingIndicator />);
    expect(container.querySelector('.typing-indicator')).toBeInTheDocument();
  });

  it('is labeled for assistive tech', () => {
    render(<TypingIndicator />);
    expect(screen.getByLabelText('Assistant is typing')).toBeInTheDocument();
  });
});
