interface IdleClassBannerProps {
  nonIdleGestureCount: number;
  hasIdleClass: boolean;
}

export function IdleClassBanner({
  nonIdleGestureCount,
  hasIdleClass,
}: IdleClassBannerProps) {
  if (nonIdleGestureCount !== 1) {
    return null;
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      {hasIdleClass ? (
        <>
          <p className="font-semibold text-amber-900 mb-1">Recorded Idle Class Enabled</p>
          <p className="text-sm text-amber-800">
            This model includes your real Idle recordings so it can separate your gesture
            from no-motion behavior on device.
          </p>
        </>
      ) : (
        <>
          <p className="font-semibold text-amber-900 mb-1">Auto Idle Class Enabled</p>
          <p className="text-sm text-amber-800">
            Since you selected one gesture, the app adds an "Idle" class automatically so
            the model can learn the difference between your gesture and no gesture.
          </p>
        </>
      )}
    </div>
  );
}
