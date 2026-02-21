import { useState } from 'react';
import { useSessionStore } from '../state/sessionStore';
import type { DesignJournalEntry } from '../storage/schema';

interface JournalPromptProps {
  prompt: DesignJournalEntry['prompt'];
  title: string;
  placeholder: string;
}

export function JournalPrompt({ prompt, title, placeholder }: JournalPromptProps) {
  const { addJournalEntry } = useSessionStore();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await addJournalEntry(prompt, trimmed);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left">
      <h4 className="font-semibold text-slate-800 mb-2">{title}</h4>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full border border-slate-300 rounded-lg p-3 text-sm resize-none"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">{value.length}/250</span>
        <button
          onClick={() => void save()}
          disabled={saving || !value.trim() || saved}
          className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-slate-800 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saved ? 'Saved' : saving ? 'Saving...' : 'Save Reflection'}
        </button>
      </div>
    </div>
  );
}

