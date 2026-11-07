import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.js';
import { BrandLogo, Button } from '../components/ui.js';

export function NotFoundPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-ink-900">
      <BrandLogo size={52} />
      <h1 className="text-5xl font-black brand-text">{t.notFound.title}</h1>
      <p className="text-sm text-mist-400">{t.notFound.subtitle}</p>
      <Button onClick={() => navigate('/app')}>{t.notFound.goHome}</Button>
    </div>
  );
}
