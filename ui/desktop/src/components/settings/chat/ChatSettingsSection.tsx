import { ModeSection } from '../mode/ModeSection';
import { DictationSettings } from '../dictation/DictationSettings';
import { SecurityToggle } from '../security/SecurityToggle';
import { ResponseStylesSection } from '../response_styles/ResponseStylesSection';
import { GoosehintsSection } from './GoosehintsSection';
import { SpellcheckToggle } from './SpellcheckToggle';
import { MathRenderingSettings } from './MathRenderingSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { defineMessages, useIntl } from '../../../i18n';

const i18n = defineMessages({
  modeTitle: {
    id: 'chatSettings.modeTitle',
    defaultMessage: 'Default Mode',
  },
  modeDescription: {
    id: 'chatSettings.modeDescription',
    defaultMessage:
      'Choose the default mode Goose uses for new sessions. Existing sessions keep their current mode.',
  },
  responseStylesTitle: {
    id: 'chatSettings.responseStylesTitle',
    defaultMessage: 'Response Styles',
  },
  responseStylesDescription: {
    id: 'chatSettings.responseStylesDescription',
    defaultMessage: 'Choose how Goose should format and style its responses',
  },
  mathTitle: {
    id: 'chatSettings.mathTitle',
    defaultMessage: 'Math Rendering',
  },
  mathDescription: {
    id: 'chatSettings.mathDescription',
    defaultMessage: 'Configure KaTeX LaTeX rendering for mathematical expressions',
  },
});

export default function ChatSettingsSection() {
  const intl = useIntl();

  return (
    <div className="space-y-4 pr-4 pb-8 mt-1">
      <Card className="pb-2 rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="">{intl.formatMessage(i18n.modeTitle)}</CardTitle>
          <CardDescription>{intl.formatMessage(i18n.modeDescription)}</CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <ModeSection />
        </CardContent>
      </Card>

      <Card className="pb-2 rounded-lg">
        <CardContent className="px-2">
          <GoosehintsSection />
        </CardContent>
      </Card>

      <Card className="pb-2 rounded-lg">
        <CardContent className="px-2">
          <DictationSettings />
          <SpellcheckToggle />
        </CardContent>
      </Card>

      <Card className="pb-2 rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="">{intl.formatMessage(i18n.responseStylesTitle)}</CardTitle>
          <CardDescription>{intl.formatMessage(i18n.responseStylesDescription)}</CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <ResponseStylesSection />
        </CardContent>
      </Card>

      <Card className="pb-2 rounded-lg">
        <CardHeader className="pb-0">
          <CardTitle className="">{intl.formatMessage(i18n.mathTitle)}</CardTitle>
          <CardDescription>{intl.formatMessage(i18n.mathDescription)}</CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <MathRenderingSettings />
        </CardContent>
      </Card>

      <Card className="pb-2 rounded-lg">
        <CardContent className="px-2">
          <SecurityToggle />
        </CardContent>
      </Card>
    </div>
  );
}
