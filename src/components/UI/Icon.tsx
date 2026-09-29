import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, Award, Battery, Camera, CameraOff,
  Check, CheckCircle, ChevronRight, Clock, Crosshair, Eye, Flag, Heart, Home, Info,
  Layers, Loader, Lock, Map, Maximize, Play, RotateCcw, Settings, Shield, Sliders,
  Target, TrendingUp, User, X, XCircle, Zap,
} from 'react-feather';

const icons = {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, Award, Battery, Camera, CameraOff,
  Check, CheckCircle, ChevronRight, Clock, Crosshair, Eye, Flag, Heart, Home, Info,
  Layers, Loader, Lock, Map, Maximize, Play, RotateCcw, Settings, Shield, Sliders,
  Target, TrendingUp, User, X, XCircle, Zap,
};

export type IconName = keyof typeof icons;

/** All interface symbols come from the same Feather set. */
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const FeatherIcon = icons[name];
  return <FeatherIcon className={`icon ${className}`} size={20} strokeWidth={1.6} aria-hidden="true" focusable="false" />;
}
