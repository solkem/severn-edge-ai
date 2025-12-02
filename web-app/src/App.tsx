/**
 * Severn Edge AI - Main Application
 * Student workflow: Connect → Collect → Train → Test
 */

import { useState } from 'react';
import { ConnectPage } from './pages/ConnectPage';
import { CollectPage } from './pages/CollectPage';
import { TrainPage } from './pages/TrainPage';
import { TestPage } from './pages/TestPage';
import type { DeviceInfo } from './types/ble';
import type { Sample, GestureLabel } from './types';
import { AppStage } from './types';
import { TrainingService } from './services/trainingService';

function App() {
  const [stage, setStage] = useState<AppStage>(AppStage.CONNECT);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [labels, setLabels] = useState<GestureLabel[]>([]);
  const [trainingService, setTrainingService] = useState<TrainingService | null>(null);

  const handleConnected = (info: DeviceInfo) => {
    setDeviceInfo(info);
    setStage(AppStage.COLLECT);
  };

  const handleCollectComplete = (collectedSamples: Sample[], collectedLabels: GestureLabel[]) => {
    setSamples(collectedSamples);
    setLabels(collectedLabels);
    setStage(AppStage.TRAIN);
  };

  const handleTrainComplete = (service: TrainingService) => {
    setTrainingService(service);
    setStage(AppStage.TEST);
  };

  return (
    <div className="app">
      {/* Progress Indicator */}
      {stage !== AppStage.CONNECT && (
        <div className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              {/* Device Info */}
              <div className="flex items-center space-x-3">
                <img src="/severn-logo.png" alt="Severn" className="w-10 h-10" />
                <div>
                  <div className="text-sm font-bold text-gray-800">
                    {deviceInfo?.chipType === 0 ? 'LSM9DS1 (Rev1)' : 'BMI270 (Rev2)'}
                  </div>
                  <div className="text-xs text-gray-500">
                    Firmware v{deviceInfo?.firmwareMajor}.{deviceInfo?.firmwareMinor}
                  </div>
                </div>
              </div>

              {/* Stage Progress */}
              <div className="flex space-x-2">
                {[
                  { stage: AppStage.COLLECT, label: 'Collect', emoji: '📊' },
                  { stage: AppStage.TRAIN, label: 'Train', emoji: '🧠' },
                  { stage: AppStage.TEST, label: 'Test', emoji: '🎯' },
                ].map((item) => {
                  const isCurrent = stage === item.stage;
                  const isComplete =
                    (item.stage === AppStage.COLLECT &&
                      (stage === AppStage.TRAIN || stage === AppStage.TEST)) ||
                    (item.stage === AppStage.TRAIN && stage === AppStage.TEST);

                  return (
                    <div
                      key={item.stage}
                      className={`px-3 py-1 rounded-lg text-sm font-bold ${
                        isCurrent
                          ? 'bg-blue-600 text-white'
                          : isComplete
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {item.emoji} {item.label}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={stage !== AppStage.CONNECT ? 'pt-20' : ''}>
        {stage === AppStage.CONNECT && <ConnectPage onConnected={handleConnected} />}

        {stage === AppStage.COLLECT && <CollectPage onComplete={handleCollectComplete} />}

        {stage === AppStage.TRAIN && (
          <TrainPage samples={samples} labels={labels} onComplete={handleTrainComplete} />
        )}

        {stage === AppStage.TEST && trainingService && (
          <TestPage labels={labels} trainingService={trainingService} />
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-100 border-t border-gray-300 py-2">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-gray-600 flex items-center justify-center gap-2">
          <img src="/severn-logo.png" alt="Severn School" className="w-4 h-4 inline" />
          <span>Severn Edge AI v1.0 | Need help? Ask your teacher!</span>
        </div>
      </div>
    </div>
  );
}

export default App;
