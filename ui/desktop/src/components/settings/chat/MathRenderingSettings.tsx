import { useState, useEffect } from 'react';
import { Switch } from '../../ui/switch';
import { defineMessages, useIntl } from '../../../i18n';

const i18n = defineMessages({
  fontScaleLabel: {
    id: 'mathSettings.fontScaleLabel',
    defaultMessage: 'Math font size',
  },
  fontScaleDescription: {
    id: 'mathSettings.fontScaleDescription',
    defaultMessage: 'Scale factor for KaTeX math rendering relative to body text (e.g. 1.3 = 30% larger).',
  },
  singleDollarLabel: {
    id: 'mathSettings.singleDollarLabel',
    defaultMessage: 'Enable $...$ inline math',
  },
  singleDollarDescription: {
    id: 'mathSettings.singleDollarDescription',
    defaultMessage:
      'Treat single dollar signs as inline LaTeX delimiters. Off by default because $ appears in non-math contexts (prices, shell variables).',
  },
});

export const MathRenderingSettings = () => {
  const intl = useIntl();
  const [fontScale, setFontScale] = useState(1.1);
  const [singleDollar, setSingleDollar] = useState(false);

  useEffect(() => {
    Promise.all([
      window.electron.getSetting('mathFontScale'),
      window.electron.getSetting('mathSingleDollar'),
    ]).then(([scale, sd]) => {
      if (typeof scale === 'number') setFontScale(scale);
      if (typeof sd === 'boolean') setSingleDollar(sd);
    });
  }, []);

  const handleScaleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setFontScale(value);
    document.documentElement.style.setProperty('--math-font-scale', String(value));
    await window.electron.setSetting('mathFontScale', value);
  };

  const handleSingleDollarToggle = async (checked: boolean) => {
    setSingleDollar(checked);
    await window.electron.setSetting('mathSingleDollar', checked);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between py-2 px-2 hover:bg-background-secondary rounded-lg transition-all">
        <div>
          <h3 className="text-text-primary">{intl.formatMessage(i18n.fontScaleLabel)}</h3>
          <p className="text-xs text-text-secondary max-w-md mt-[2px]">
            {intl.formatMessage(i18n.fontScaleDescription)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <input
            type="range"
            min="0.8"
            max="2.0"
            step="0.05"
            value={fontScale}
            onChange={handleScaleChange}
            className="w-28 accent-block-teal"
          />
          <span className="text-xs text-text-secondary w-8 text-right">{fontScale.toFixed(2)}×</span>
        </div>
      </div>

      <div className="flex items-center justify-between py-2 px-2 hover:bg-background-secondary rounded-lg transition-all">
        <div>
          <h3 className="text-text-primary">{intl.formatMessage(i18n.singleDollarLabel)}</h3>
          <p className="text-xs text-text-secondary max-w-md mt-[2px]">
            {intl.formatMessage(i18n.singleDollarDescription)}
          </p>
        </div>
        <div className="flex items-center">
          <Switch checked={singleDollar} onCheckedChange={handleSingleDollarToggle} variant="mono" />
        </div>
      </div>
    </div>
  );
};
