/**
 * Kid-Friendly Feedback Component
 * Shows celebratory animations and encouraging messages
 */

import { useEffect } from 'react';
import confetti from 'canvas-confetti';

export type FeedbackStatus = 'recording' | 'success' | 'retry' | 'thinking';

interface KidFeedbackProps {
  status: FeedbackStatus;
  message?: string;
}

export function KidFeedback({ status, message }: KidFeedbackProps) {
  useEffect(() => {
    if (status === 'success') {
      // Trigger confetti celebration
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'],
      });

      // Play success sound if available
      // Note: We'll add sound files later
      // new Audio('/sounds/success.mp3').play().catch(() => {});
    }
  }, [status]);

  const getEmoji = () => {
    switch (status) {
      case 'recording':
        return '🎯';
      case 'success':
        return '🎉';
      case 'retry':
        return '💪';
      case 'thinking':
        return '🤔';
      default:
        return '🤖';
    }
  };

  const getMessage = () => {
    if (message) return message;

    switch (status) {
      case 'recording':
        return 'Show me your move!';
      case 'success':
        return 'Awesome! I learned that!';
      case 'retry':
        return "Let's try again - move a bit bigger!";
      case 'thinking':
        return 'Thinking...';
      default:
        return 'Ready!';
    }
  };

  const getColor = () => {
    switch (status) {
      case 'recording':
        return 'text-primary-600';
      case 'success':
        return 'text-emerald-600';
      case 'retry':
        return 'text-amber-600';
      case 'thinking':
        return 'text-violet-600';
      default:
        return 'text-slate-600';
    }
  };

  return (
    <div className="text-center py-8">
      <div className={`emoji-large ${status === 'recording' ? 'animate-pulse-slow' : ''}`}>
        {getEmoji()}
      </div>
      <p className={`text-2xl font-bold mt-4 ${getColor()}`}>
        {getMessage()}
      </p>
    </div>
  );
}
