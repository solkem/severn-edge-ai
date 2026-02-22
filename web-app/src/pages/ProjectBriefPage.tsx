import { useState } from 'react';
import { useSessionStore } from '../state/sessionStore';

interface ProjectBriefPageProps {
  onComplete: () => void;
}

const USE_CASES = [
  { value: 'accessibility', label: 'Accessibility Helper' },
  { value: 'gaming', label: 'Gaming Controller' },
  { value: 'art', label: 'Art & Music' },
  { value: 'communication', label: 'Communication' },
  { value: 'other', label: 'Other' },
] as const;

export function ProjectBriefPage({ onComplete }: ProjectBriefPageProps) {
  const { session, setProjectBrief } = useSessionStore();
  const [studentName, setStudentName] = useState(session?.projectBrief?.studentName ?? '');
  const [name, setName] = useState(session?.projectBrief?.name ?? '');
  const [problemStatement, setProblemStatement] = useState(
    session?.projectBrief?.problemStatement ?? '',
  );
  const [useCase, setUseCase] = useState<
    'accessibility' | 'gaming' | 'art' | 'communication' | 'other'
  >(session?.projectBrief?.useCase ?? 'other');
  const [gestureIdeas, setGestureIdeas] = useState(session?.projectBrief?.gestureIdeas ?? '');

  const canContinue = studentName.trim() && name.trim() && problemStatement.trim();

  const submit = () => {
    setProjectBrief({
      studentName: studentName.trim(),
      name: name.trim(),
      problemStatement: problemStatement.trim(),
      useCase,
      gestureIdeas: gestureIdeas.trim(),
    });
    onComplete();
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="card">
        <h1 className="heading-md mb-2">Final AI Project Brief</h1>
        <p className="text-slate-600 mb-6">
          You have tested your model. Now explain what you built and why.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Student Name</label>
            <input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              maxLength={50}
              className="w-full border border-slate-300 rounded-lg p-3"
              placeholder="Student Name"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Project Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="w-full border border-slate-300 rounded-lg p-3"
              placeholder="Magic Wand Controller"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              What problem will this solve?
            </label>
            <textarea
              value={problemStatement}
              onChange={(e) => setProblemStatement(e.target.value)}
              rows={3}
              maxLength={220}
              className="w-full border border-slate-300 rounded-lg p-3 resize-none"
              placeholder="Help someone control music with gestures."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Use Case</label>
            <select
              value={useCase}
              onChange={(e) =>
                setUseCase(
                  e.target.value as
                    | 'accessibility'
                    | 'gaming'
                    | 'art'
                    | 'communication'
                    | 'other',
                )
              }
              className="w-full border border-slate-300 rounded-lg p-3"
            >
              {USE_CASES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Gesture Ideas (optional)
            </label>
            <input
              value={gestureIdeas}
              onChange={(e) => setGestureIdeas(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3"
              placeholder="wave, spin, point"
            />
          </div>
        </div>

        <button
          onClick={submit}
          disabled={!canContinue}
          className="btn-primary w-full mt-6 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue to Portfolio
        </button>
      </div>
    </div>
  );
}
