/**
 * Train Page - Model Training with TensorFlow.js
 */

import { useState } from 'react';
import { Sample, GestureLabel, TrainingProgress } from '../types';
import { TrainingService } from '../services/trainingService';
import { KidFeedback } from '../components/KidFeedback';

interface TrainPageProps {
  samples: Sample[];
  labels: GestureLabel[];
  onComplete: (trainingService: TrainingService) => void;
}

export function TrainPage({ samples, labels, onComplete }: TrainPageProps) {
  const [isTraining, setIsTraining] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trainingService] = useState(() => new TrainingService());

  const handleTrain = async () => {
    setIsTraining(true);
    setError(null);

    try {
      const result = await trainingService.train(samples, labels, (prog) => {
        setProgress(prog);
      });

      setAccuracy(result.accuracy);
      setIsDone(true);

      console.log('Training complete:', result);
    } catch (err) {
      console.error('Training failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsTraining(false);
    }
  };

  const handleNext = () => {
    onComplete(trainingService);
  };

  const formatAccuracy = (acc: number) => {
    return (acc * 100).toFixed(1);
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="card relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2"></div>
        
        {!isTraining && !isDone && (
          <div className="text-center relative z-10">
            <div className="emoji-large mb-6 animate-float">🧠</div>
            <h1 className="heading-lg mb-4">Train Your Model</h1>
            <p className="text-xl text-slate-600 mb-8">
              Ready to teach the AI? This will take about 30 seconds.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8 max-w-lg mx-auto">
              <h3 className="font-bold text-slate-800 mb-4 text-left flex items-center gap-2">
                <span className="text-xl">📊</span> Training Summary
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100">
                  <span className="text-slate-600">Total Samples</span>
                  <span className="font-bold text-primary-600 text-lg">{samples.length}</span>
                </div>
                <div className="space-y-2">
                  {labels.map((label) => (
                    <div key={label.id} className="flex justify-between text-sm text-slate-500 px-2">
                      <span>{label.name}</span>
                      <span>{label.sampleCount} samples</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6 text-left flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h3 className="font-bold text-rose-900">Training Failed</h3>
                  <p className="text-rose-800 text-sm">{error}</p>
                </div>
              </div>
            )}

            <button onClick={handleTrain} className="btn-primary text-xl w-full py-4 shadow-xl shadow-primary-200">
              🚀 Start Training
            </button>
          </div>
        )}

        {isTraining && !isDone && progress && (
          <div className="text-center relative z-10">
            <KidFeedback status="thinking" message="Teaching the AI your gestures..." />

            <div className="mt-8 max-w-lg mx-auto space-y-6">
              <div className="text-left">
                <div className="flex justify-between text-sm font-bold text-slate-600 mb-2">
                  <span>Progress</span>
                  <span>{Math.round((progress.epoch / progress.totalEpochs) * 100)}%</span>
                </div>
                <div className="bg-slate-100 rounded-full h-4 overflow-hidden border border-slate-200">
                  <div
                    className="bg-primary-600 h-full transition-all duration-300 ease-out relative overflow-hidden"
                    style={{
                      width: `${(progress.epoch / progress.totalEpochs) * 100}%`,
                    }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                  </div>
                </div>
                <div className="text-xs text-slate-400 mt-1 text-center">
                  Epoch {progress.epoch} of {progress.totalEpochs}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                  <div className="text-blue-600 text-sm font-bold mb-1">Accuracy</div>
                  <div className="text-3xl font-bold text-blue-700">
                    {formatAccuracy(progress.accuracy)}%
                  </div>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                  <div className="text-emerald-600 text-sm font-bold mb-1">Loss</div>
                  <div className="text-3xl font-bold text-emerald-700">
                    {progress.loss.toFixed(3)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isDone && accuracy !== null && (
          <div className="text-center relative z-10">
            <KidFeedback status="success" message="Your robot learned new tricks!" />

            <div className="mt-8 space-y-6 max-w-lg mx-auto">
              <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-emerald-400"></div>
                <h3 className="text-xl font-bold text-emerald-900 mb-2">
                  Training Complete!
                </h3>
                <div className="text-7xl font-bold text-emerald-600 mb-2 tracking-tighter">
                  {formatAccuracy(accuracy)}<span className="text-4xl">%</span>
                </div>
                <div className="text-emerald-700 font-medium">Model Accuracy</div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-left">
                <p className="text-sm text-slate-500 mb-3 font-bold uppercase tracking-wider">Recognized Gestures</p>
                <div className="space-y-2">
                  {labels.map((label) => (
                    <div key={label.id} className="flex items-center gap-2 text-slate-700 font-medium bg-white p-2 rounded-lg border border-slate-100">
                      <span className="text-emerald-500">✓</span> {label.name}
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={handleNext} className="btn-success text-xl w-full py-4 shadow-xl shadow-emerald-200">
                Next: Test It Out! →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
