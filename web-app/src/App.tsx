/**
 * Severn Edge AI - Main Application
 * Student workflow: Connect -> Preview -> Collect -> Train -> Test -> Project Brief -> Portfolio
 */

import { useEffect, useMemo, useState } from 'react';
import { ConnectPage } from './pages/ConnectPage';
import { ProjectBriefPage } from './pages/ProjectBriefPage';
import { PreviewPage } from './pages/PreviewPage';
import { CollectPage } from './pages/CollectPage';
import { TrainPage } from './pages/TrainPage';
import { TestPage } from './pages/TestPage';
import { PortfolioPage } from './pages/PortfolioPage';
import type { DeviceInfo } from './types/ble';
import type { Sample, GestureLabel, AppStage as AppStageType } from './types';
import { AppStage } from './types';
import { TrainingService } from './services/trainingService';
import { useSessionStore } from './state/sessionStore';
import { useConnectionStore } from './state/connectionStore';
import { ConnectionStatusPill } from './components/ConnectionStatusPill';
import { ReconnectModal } from './components/ReconnectModal';
import { SessionRecoveryBanner } from './components/SessionRecoveryBanner';
import { BadgeToast } from './components/BadgeToast';
import { BadgeTray } from './components/BadgeTray';
import { KnowledgeCheckModal } from './components/KnowledgeCheckModal';
import { KNOWLEDGE_CHECKS } from './data/knowledgeChecks';
import type { CheckpointId } from './storage/schema';

function App() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [trainingService, setTrainingService] = useState<TrainingService | null>(null);
  const [activeCheckId, setActiveCheckId] = useState<CheckpointId | null>(null);
  const [pendingStage, setPendingStage] = useState<AppStageType | null>(null);

  const initializeSession = useSessionStore((state) => state.initialize);
  const session = useSessionStore((state) => state.session);
  const samples: Sample[] = useSessionStore((state) => state.samples);
  const setSessionStage = useSessionStore((state) => state.setStage);
  const setSessionDeviceName = useSessionStore((state) => state.setDeviceName);
  const setSessionGestures = useSessionStore((state) => state.setGestures);
  const setSessionSamples = useSessionStore((state) => state.setSamples);
  const addBadge = useSessionStore((state) => state.addBadge);
  const clearAwardedBadge = useSessionStore((state) => state.clearAwardedBadge);
  const startFresh = useSessionStore((state) => state.startFresh);
  const lastAwardedBadge = useSessionStore((state) => state.lastAwardedBadge);

  const connectSuccess = useConnectionStore((state) => state.connectSuccess);
  const labels: GestureLabel[] = session?.gestures ?? [];
  const persistedStage = session?.currentStage ?? AppStage.CONNECT;
  const stage = useMemo(() => {
    if (
      (persistedStage === AppStage.TEST ||
        persistedStage === AppStage.PROJECT_BRIEF ||
        persistedStage === AppStage.PORTFOLIO) &&
      !trainingService
    ) {
      return AppStage.TRAIN;
    }
    return persistedStage;
  }, [persistedStage, trainingService]);

  useEffect(() => {
    void initializeSession();
  }, [initializeSession]);

  const goToStage = (nextStage: AppStageType) => {
    setSessionStage(nextStage);
  };

  const requestGate = (checkId: CheckpointId, nextStage: AppStageType) => {
    const passed = session?.checkpointIds.includes(checkId);
    if (passed) {
      goToStage(nextStage);
      return;
    }
    setPendingStage(nextStage);
    setActiveCheckId(checkId);
  };

  const handleConnected = (info: DeviceInfo) => {
    setDeviceInfo(info);
    setSessionDeviceName(info ? `${info.firmwareMajor}.${info.firmwareMinor}` : null);
    addBadge('connected');
    goToStage(AppStage.PREVIEW);
    connectSuccess(info ? 'Arduino' : null);
  };

  const handleProjectBriefComplete = () => {
    goToStage(AppStage.PORTFOLIO);
  };

  const handlePreviewReady = () => {
    requestGate('gate-1-sensor', AppStage.COLLECT);
  };

  const handleCollectComplete = (collectedSamples: Sample[], collectedLabels: GestureLabel[]) => {
    setSessionGestures(collectedLabels);
    void setSessionSamples(collectedSamples);
    if (
      collectedLabels.length > 0 &&
      collectedLabels.every((l) => l.sampleCount >= 10)
    ) {
      addBadge('data-scientist');
    }
    requestGate('gate-2-gesture', AppStage.TRAIN);
  };

  const handleTrainComplete = (service: TrainingService) => {
    setTrainingService(service);
    requestGate('gate-3-confidence', AppStage.TEST);
  };

  const handleGatePass = () => {
    if (pendingStage) {
      goToStage(pendingStage);
    }
    setActiveCheckId(null);
    setPendingStage(null);
  };

  const handleOpenPortfolio = () => {
    const nextStage = session?.projectBrief ? AppStage.PORTFOLIO : AppStage.PROJECT_BRIEF;
    requestGate('gate-4-edge-ai', nextStage);
  };

  const handleStartOver = () => {
    setSessionStage(AppStage.CONNECT);
    void startFresh();
    setDeviceInfo(null);
    setTrainingService(null);
    setActiveCheckId(null);
    setPendingStage(null);
  };

  const stageOrder = useMemo(
    () => [
      AppStage.PREVIEW,
      AppStage.COLLECT,
      AppStage.TRAIN,
      AppStage.TEST,
      AppStage.PROJECT_BRIEF,
      AppStage.PORTFOLIO,
    ],
    [],
  );

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
                  { stage: AppStage.PROJECT_BRIEF, label: 'Brief', icon: '📋' },
                  { stage: AppStage.PORTFOLIO, label: 'Portfolio', icon: '📁' },
                ].map((item, idx) => {
                  const isCurrent = stage === item.stage;
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
        {stage === AppStage.CONNECT && (
          <div className="max-w-5xl mx-auto px-4">
            <SessionRecoveryBanner />
            <ConnectPage onConnected={handleConnected} />
          </div>
        )}

        {stage === AppStage.PROJECT_BRIEF && (
          <ProjectBriefPage onComplete={handleProjectBriefComplete} />
        )}

        {stage === AppStage.PREVIEW && <PreviewPage onReady={handlePreviewReady} />}

        {stage === AppStage.COLLECT && <CollectPage onComplete={handleCollectComplete} />}

        {stage === AppStage.TRAIN && (
          <TrainPage samples={samples} labels={labels} onComplete={handleTrainComplete} />
        )}

        {stage === AppStage.TEST && trainingService && (
          <TestPage
            labels={labels}
            trainingService={trainingService}
            onStartOver={handleStartOver}
            onOpenPortfolio={handleOpenPortfolio}
          />
        )}

        {stage === AppStage.PORTFOLIO && (
          <PortfolioPage
            onBackToTest={() => goToStage(AppStage.TEST)}
            onStartOver={handleStartOver}
          />
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-500 space-y-2">
          <div className="flex items-center justify-center gap-2">
            <span className="font-display font-bold text-primary-600">Severn Edge AI</span>
            <span>•</span>
            <span>v2</span>
            <ConnectionStatusPill />
          </div>
          <BadgeTray badgeIds={session?.badgeIds ?? []} />
        </div>
      </div>

      <ReconnectModal />

      {lastAwardedBadge && (
        <BadgeToast
          badgeId={lastAwardedBadge}
          onClose={clearAwardedBadge}
        />
      )}

      {activeCheckId && (
        <KnowledgeCheckModal
          check={KNOWLEDGE_CHECKS[activeCheckId]}
          onPass={handleGatePass}
        />
      )}
    </div>
  );
}

export default App;
