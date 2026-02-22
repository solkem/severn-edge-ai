/**
 * Train Page - Model Training with TensorFlow.js
 * 
 * Features:
 * - Create untrained model (random weights) for initial deployment
 * - Train model with collected samples
 * - Progressive training: continue training to improve accuracy
 * - Deploy to Arduino via BLE or download as header file
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sample, GestureLabel, TrainingProgress } from '../types';
import { TrainingService } from '../services/trainingService';
import { KidFeedback } from '../components/KidFeedback';
import { exportForArduino, modelToSimpleNNBytes } from '../services/modelExportService';
import { bleModelUploadService, UploadProgress } from '../services/bleModelUploadService';
import { getBLEService } from '../services/bleService';
import { IdleClassBanner } from '../components/IdleClassBanner';
import { JournalPrompt } from '../components/JournalPrompt';
import { useSessionStore } from '../state/sessionStore';

interface TrainPageProps {
  samples: Sample[];
  labels: GestureLabel[];
  onComplete: (trainingService: TrainingService) => void;
}

export function TrainPage({ samples, labels, onComplete }: TrainPageProps) {
  const [isTraining, setIsTraining] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trainingService] = useState(() => new TrainingService());
  const [hasModel, setHasModel] = useState(false);
  const [trainingCount, setTrainingCount] = useState(0);
  const { setTrainingAccuracy, addBadge } = useSessionStore();

  const trainingSamples = useMemo(
    () => samples.filter((sample) => sample.split !== 'test'),
    [samples],
  );
  const testSamples = useMemo(
    () => samples.filter((sample) => sample.split === 'test'),
    [samples],
  );

  const trainingSampleCountByLabel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const label of labels) {
      counts.set(label.id, 0);
    }
    for (const sample of trainingSamples) {
      counts.set(sample.label, (counts.get(sample.label) ?? 0) + 1);
    }
    return counts;
  }, [labels, trainingSamples]);

  const testSampleCountByLabel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const label of labels) {
      counts.set(label.id, 0);
    }
    for (const sample of testSamples) {
      counts.set(sample.label, (counts.get(sample.label) ?? 0) + 1);
    }
    return counts;
  }, [labels, testSamples]);

  // Check if we have samples to train with
  const hasSamples = trainingSamples.length > 0;
  const hasEnoughSamples = labels.every(
    (label) => (trainingSampleCountByLabel.get(label.id) ?? 0) >= 3,
  );

  const createUntrainedModel = useCallback(() => {
    try {
      // Use at least 2 classes (single-gesture mode auto-adds Idle during training)
      const numClasses = Math.max(2, labels.length);
      trainingService.createModel(numClasses);
      setHasModel(true);
      console.log('Created untrained model with random weights');
    } catch (err) {
      console.error('Failed to create model:', err);
    }
  }, [labels.length, trainingService]);

  // Create untrained model when labels are available
  useEffect(() => {
    if (labels.length >= 1 && !hasModel) {
      createUntrainedModel();
    }
  }, [createUntrainedModel, hasModel, labels.length]);

  const handleTrain = async () => {
    setIsTraining(true);
    setError(null);

    try {
      const result = await trainingService.train(trainingSamples, labels, (prog) => {
        setProgress(prog);
      });

      setAccuracy(result.accuracy);
      setTrainingAccuracy(result.accuracy);
      if (result.accuracy >= 0.8) {
        addBadge('ai-trainer');
      }
      setIsDone(true);
      setIsTraining(false);
      setTrainingCount(prev => prev + 1);
      setHasModel(true);

      console.log('Training complete:', result);
    } catch (err) {
      console.error('Training failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsTraining(false);
    }
  };

  const handleTrainMore = async () => {
    // Continue training to improve the model
    setIsTraining(true);
    setIsDone(false);
    setError(null);

    try {
      const result = await trainingService.train(trainingSamples, labels, (prog) => {
        setProgress(prog);
      });

      setAccuracy(result.accuracy);
      setTrainingAccuracy(result.accuracy);
      if (result.accuracy >= 0.8) {
        addBadge('ai-trainer');
      }
      setIsDone(true);
      setIsTraining(false);
      setTrainingCount(prev => prev + 1);

      console.log('Additional training complete:', result);
    } catch (err) {
      console.error('Training failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsTraining(false);
    }
  };

  const handleExport = async () => {
    const model = trainingService.getModel();
    if (!model) return;

    setIsExporting(true);
    try {
      await exportForArduino(model, labels);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleBLEUpload = async () => {
    const model = trainingService.getModel();
    if (!model) return;

    setIsUploading(true);
    setUploadProgress(null);

    try {
      // When single-gesture mode, the model has an auto-added "Idle" class
      const labelNames = labels.length === 1
        ? [...labels.map(l => l.name), 'Idle']
        : labels.map(l => l.name);
      const modelBytes = modelToSimpleNNBytes(model, labelNames);
      const bleService = getBLEService();
      const server = bleService.getServer();

      if (!server) {
        throw new Error('Not connected to Arduino. Please connect via Bluetooth first.');
      }

      const initialized = await bleModelUploadService.initialize(server);
      if (!initialized) {
        throw new Error('Failed to initialize model upload. Make sure your Arduino firmware supports OTA model updates.');
      }

      await bleModelUploadService.uploadModel(modelBytes, labelNames, (progress) => {
        setUploadProgress(progress);
      });
      addBadge('edge-engineer');

    } catch (err) {
      console.error('BLE upload failed:', err);
      setUploadProgress({
        state: 'error',
        progress: 0,
        bytesTransferred: 0,
        totalBytes: 0,
        message: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsUploading(false);
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
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2"></div>

        {/* Pre-Training View */}
        {!isTraining && !isDone && (
          <div className="text-center relative z-10">
            <div className="emoji-large mb-6 animate-float"></div>
            <h1 className="heading-lg mb-4">Train Your Model</h1>
            <p className="text-xl text-slate-600 mb-8">
              {hasSamples 
                ? 'Ready to teach the AI? This will take about 30 seconds.'
                : 'You can deploy an untrained model now, or collect samples first!'}
            </p>

            {/* Training Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8 max-w-lg mx-auto">
              <h3 className="font-bold text-slate-800 mb-4 text-left flex items-center gap-2">
                <span className="text-xl"></span> Training Summary
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100">
                  <span className="text-slate-600">Training Samples</span>
                  <span className={`font-bold text-lg ${trainingSamples.length > 0 ? 'text-primary-600' : 'text-slate-400'}`}>
                    {trainingSamples.length}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100">
                  <span className="text-slate-600">Held-out Test Samples</span>
                  <span className={`font-bold text-lg ${testSamples.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {testSamples.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {labels.map((label) => (
                    <div key={label.id} className="flex justify-between text-sm text-slate-500 px-2">
                      <span>{label.name}</span>
                      <span className={(trainingSampleCountByLabel.get(label.id) ?? 0) >= 3 ? 'text-emerald-600' : 'text-amber-600'}>
                        {trainingSampleCountByLabel.get(label.id) ?? 0} train
                        {' / '}
                        {testSampleCountByLabel.get(label.id) ?? 0} test
                        {' '}
                        {(trainingSampleCountByLabel.get(label.id) ?? 0) < 3 && '(need 3+ train)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6 text-left flex items-start gap-3">
                <span className="text-2xl"></span>
                <div>
                  <h3 className="font-bold text-rose-900">Training Failed</h3>
                  <p className="text-rose-800 text-sm">{error}</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-4">
              {hasEnoughSamples ? (
                <button onClick={handleTrain} className="btn-primary text-xl w-full py-4 shadow-xl shadow-primary-200">
                   Start Training
                </button>
              ) : (
                <button disabled className="btn-primary text-xl w-full py-4 opacity-50 cursor-not-allowed">
                   Need More Samples to Train
                </button>
              )}

              {/* Deploy Untrained Model Option */}
              {hasModel && !hasSamples && (
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl"></span>
                    <div className="flex-grow text-left">
                      <h4 className="font-bold text-amber-900 mb-1">Deploy Untrained Model</h4>
                      <p className="text-sm text-amber-700 mb-3">
                        Upload a model with random weights. It won't recognize gestures yet, 
                        but you can test the upload process!
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleBLEUpload}
                          disabled={isUploading}
                          className="btn-secondary text-sm py-2 px-4 bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900"
                        >
                          {isUploading ? ' Uploading...' : ' Upload Random Model'}
                        </button>
                      </div>
                      {uploadProgress && (
                        <div className={`mt-2 p-2 rounded text-xs ${
                          uploadProgress.state === 'success' ? 'bg-emerald-100 text-emerald-800' :
                          uploadProgress.state === 'error' ? 'bg-rose-100 text-rose-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {uploadProgress.message}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Training Progress View */}
        {isTraining && !isDone && progress && (
          <div className="text-center relative z-10">
            <KidFeedback status="thinking" message={trainingCount > 0 ? "Making the AI even smarter..." : "Teaching the AI your gestures..."} />

            <div className="mt-8 max-w-lg mx-auto space-y-6">
              <div className="text-left">
                <div className="flex justify-between text-sm font-bold text-slate-600 mb-2">
                  <span>Progress {trainingCount > 0 && `(Training #${trainingCount + 1})`}</span>
                  <span>{Math.round((progress.epoch / progress.totalEpochs) * 100)}%</span>
                </div>
                <div className="bg-slate-100 rounded-full h-4 overflow-hidden border border-slate-200">
                  <div
                    className="bg-primary-600 h-full transition-all duration-300 ease-out relative overflow-hidden"
                    style={{ width: `${(progress.epoch / progress.totalEpochs) * 100}%` }}
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

        {/* Training Complete View */}
        {isDone && accuracy !== null && (
          <div className="text-center relative z-10">
            <KidFeedback status="success" message="Your robot learned new tricks!" />

            <div className="mt-8 space-y-6 max-w-lg mx-auto">
              <IdleClassBanner gestureCount={labels.length} />

              <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-emerald-400"></div>
                {trainingCount > 1 && (
                  <div className="absolute top-4 right-4 bg-emerald-200 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full">
                    Training #{trainingCount}
                  </div>
                )}
                <h3 className="text-xl font-bold text-emerald-900 mb-2">
                  Training Finished
                </h3>
                <div className="text-7xl font-bold text-emerald-600 mb-2 tracking-tighter">
                  {formatAccuracy(accuracy)}<span className="text-4xl">%</span>
                </div>
                <div className="text-emerald-700 font-medium">Validation Accuracy (last epoch)</div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-left">
                <p className="text-sm text-slate-500 mb-3 font-bold uppercase tracking-wider">Recognized Gestures</p>
                <div className="space-y-2">
                  {labels.map((label) => (
                    <div key={label.id} className="flex items-center gap-2 text-slate-700 font-medium bg-white p-2 rounded-lg border border-slate-100">
                      <span className="text-emerald-500"></span> {label.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Progressive Training Option */}
              {accuracy < 0.95 && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl"></span>
                    <div className="flex-grow text-left">
                      <h4 className="font-bold text-blue-900 mb-1">Want Better Accuracy?</h4>
                      <p className="text-sm text-blue-700 mb-3">
                        Train again to improve the model! Each training session can help 
                        the AI get better at recognizing your gestures.
                      </p>
                      <button
                        onClick={handleTrainMore}
                        className="btn-secondary text-sm py-2 px-4 bg-blue-100 hover:bg-blue-200 border-blue-300 text-blue-900"
                      >
                         Train More
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Deploy Section */}
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <div className="flex items-start gap-3">
                  <span className="text-2xl"></span>
                  <div className="flex-grow">
                    <h4 className="font-bold text-amber-900 mb-1">Deploy to Arduino</h4>
                    <p className="text-sm text-amber-700 mb-3">
                      Upload the model directly via Bluetooth or download as a C header file.
                    </p>

                    <div className="space-y-3">
                      {uploadProgress && (
                        <div className={`p-3 rounded-lg text-sm ${
                          uploadProgress.state === 'success'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : uploadProgress.state === 'error'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {uploadProgress.state === 'uploading' && (
                            <div className="mb-2">
                              <div className="flex justify-between text-xs mb-1">
                                <span>Uploading...</span>
                                <span>{uploadProgress.progress}%</span>
                              </div>
                              <div className="bg-blue-200 rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-blue-600 h-full transition-all duration-200"
                                  style={{ width: `${uploadProgress.progress}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {uploadProgress.message}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={handleBLEUpload}
                          disabled={isUploading}
                          className="btn-primary text-sm py-2 px-4 flex-1"
                        >
                          {isUploading ? ' Uploading...' : ' Upload via Bluetooth'}
                        </button>
                        <button
                          onClick={handleExport}
                          disabled={isExporting}
                          className="btn-secondary text-sm py-2 px-4 bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900"
                        >
                          {isExporting ? '' : ''} .h file
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <JournalPrompt
                prompt="after-train"
                title="Training Reflection"
                placeholder="What did you change to improve model accuracy?"
              />

              <button onClick={handleNext} className="btn-success text-xl w-full py-4 shadow-xl shadow-emerald-200">
                Next: Test It Out! 
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
