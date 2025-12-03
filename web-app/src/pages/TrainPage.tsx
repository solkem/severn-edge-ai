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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-4">
      <div className="max-w-3xl mx-auto py-8">
        <div className="card">
          {!isTraining && !isDone && (
            <div className="text-center">
              <div className="emoji-large mb-6">🧠</div>
              <h1 className="text-4xl font-bold text-gray-800 mb-4">Train Your Model</h1>
              <p className="text-xl text-gray-600 mb-8">
                Ready to teach the AI? This will take about 30 seconds.
              </p>

              <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 mb-6">
                <h3 className="font-bold text-purple-900 mb-2">Training Summary:</h3>
                <div className="text-left text-purple-800 space-y-1">
                  <div className="flex justify-between">
                    <span>Gestures:</span>
                    <span className="font-bold">{labels.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Samples:</span>
                    <span className="font-bold">{samples.length}</span>
                  </div>
                  {labels.map((label) => (
                    <div key={label.id} className="flex justify-between text-sm">
                      <span>• {label.name}:</span>
                      <span>{label.sampleCount} samples</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6 text-left">
                  <h3 className="font-bold text-red-900 mb-2">Training Failed</h3>
                  <p className="text-red-800">{error}</p>
                </div>
              )}

              <button onClick={handleTrain} className="btn-primary text-xl w-full py-4">
                🚀 Start Training
              </button>
            </div>
          )}

          {isTraining && !isDone && progress && (
            <div className="text-center">
              <KidFeedback status="thinking" message="Teaching the AI your gestures..." />

              <div className="mt-6 space-y-4">
                <div className="text-left">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>
                      Epoch {progress.epoch} of {progress.totalEpochs}
                    </span>
                    <span>
                      {Math.round((progress.epoch / progress.totalEpochs) * 100)}%
                    </span>
                  </div>
                  <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-purple-600 h-full transition-all duration-300"
                      style={{
                        width: `${(progress.epoch / progress.totalEpochs) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-gray-600">Accuracy</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatAccuracy(progress.accuracy)}%
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-gray-600">Loss</div>
                    <div className="text-2xl font-bold text-green-600">
                      {progress.loss.toFixed(3)}
                    </div>
                  </div>
                </div>

                {progress.valAccuracy !== undefined && (
                  <div className="text-xs text-gray-500">
                    Validation Accuracy: {formatAccuracy(progress.valAccuracy)}%
                  </div>
                )}
              </div>
            </div>
          )}

          {isDone && accuracy !== null && (
            <div className="text-center">
              <KidFeedback status="success" message="Your robot learned 3 tricks!" />

              <div className="mt-6 space-y-6">
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-green-900 mb-3">
                    Training Complete! 🎓
                  </h3>
                  <div className="text-6xl font-bold text-green-600 mb-2">
                    {formatAccuracy(accuracy)}%
                  </div>
                  <div className="text-green-800">Accuracy</div>
                </div>

                <div className="text-sm text-gray-600">
                  <p>Great job! Your model can now recognize:</p>
                  <div className="mt-2 space-y-1">
                    {labels.map((label) => (
                      <div key={label.id} className="font-bold text-gray-800">
                        ✓ {label.name}
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={handleNext} className="btn-success text-xl w-full py-4">
                  Next: Test It Out! →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
