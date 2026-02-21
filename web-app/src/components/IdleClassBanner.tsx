interface IdleClassBannerProps {
  gestureCount: number;
}

export function IdleClassBanner({ gestureCount }: IdleClassBannerProps) {
  if (gestureCount !== 1) {
    return null;
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <p className="font-semibold text-amber-900 mb-1">Auto Idle Class Enabled</p>
      <p className="text-sm text-amber-800">
        Since you selected one gesture, the app adds an "Idle" class automatically so
        the model can learn the difference between your gesture and no gesture.
      </p>
    </div>
  );
}

