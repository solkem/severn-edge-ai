/**
 * Severn Edge AI - Main Application
 * Student workflow: Connect → Collect → Train → Test
 */

import { useState } from 'react';
import { ConnectPage } from './pages/ConnectPage';
import { PreviewPage } from './pages/PreviewPage';
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
    setStage(AppStage.PREVIEW);
  };

  const handlePreviewReady = () => {
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

  const handleStartOver = () => {
    // Reset all state and go back to connect page
    setStage(AppStage.CONNECT);
    setDeviceInfo(null);
    setSamples([]);
    setLabels([]);
    setTrainingService(null);
  };

  return (
    <div className="app min-h-screen flex flex-col">
      {/* Progress Indicator */}
      {stage !== AppStage.CONNECT && (
        <div className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-md shadow-sm z-50 border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-4 py-3">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Device Info */}
              <div className="flex items-center space-x-3 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <div>
                  <div className="text-xs font-bold text-slate-700">
                    {deviceInfo?.chipType === 0 ? 'LSM9DS1' : 'BMI270'}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-none">
                    v{deviceInfo?.firmwareMajor}.{deviceInfo?.firmwareMinor}
                  </div>
                </div>
              </div>

              {/* Stage Progress */}
              <div className="flex items-center space-x-1 md:space-x-4 overflow-x-auto w-full md:w-auto justify-center pb-1 md:pb-0">
                {[
                  { stage: AppStage.PREVIEW, label: 'Preview', icon: '🔍' },
                  { stage: AppStage.COLLECT, label: 'Collect', icon: '📊' },
                  { stage: AppStage.TRAIN, label: 'Train', icon: '🧠' },
                  { stage: AppStage.TEST, label: 'Test', icon: '🎯' },
                ].map((item, idx) => {
                  const isCurrent = stage === item.stage;
                  const stageOrder = [AppStage.PREVIEW, AppStage.COLLECT, AppStage.TRAIN, AppStage.TEST];
                  const currentIdx = stageOrder.indexOf(stage);
                  const itemIdx = stageOrder.indexOf(item.stage);
                  const isComplete = itemIdx >= 0 && currentIdx > itemIdx;
                  
                  return (
                    <div key={item.stage} className="flex items-center">
                      {idx > 0 && (
                        <div className={`w-8 h-0.5 mx-2 hidden md:block ${isComplete || isCurrent ? 'bg-primary-200' : 'bg-slate-200'}`} />
                      )}
                      <div
                        className={`flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 ${
                          isCurrent
                            ? 'bg-primary-600 text-white shadow-md scale-105 ring-2 ring-primary-200 ring-offset-2'
                            : isComplete
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}
                      >
                        <span>{item.icon}</span>
                        <span className="hidden sm:inline">{item.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`flex-grow ${stage !== AppStage.CONNECT ? 'pt-24 pb-12' : ''}`}>
        {stage === AppStage.CONNECT && <ConnectPage onConnected={handleConnected} />}

        {stage === AppStage.PREVIEW && <PreviewPage onReady={handlePreviewReady} />}

        {stage === AppStage.COLLECT && <CollectPage onComplete={handleCollectComplete} />}

        {stage === AppStage.TRAIN && (
          <TrainPage samples={samples} labels={labels} onComplete={handleTrainComplete} />
        )}

        {stage === AppStage.TEST && trainingService && (
          <TestPage labels={labels} trainingService={trainingService} onStartOver={handleStartOver} />
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <span className="font-display font-bold text-primary-600">Severn Edge AI</span>
          <span>•</span>
          <span>v1.0</span>
        </div>
      </div>
    </div>
  );
}

export default App;
