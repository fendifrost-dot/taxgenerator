/**
 * PreparerSettingsPage.tsx
 *
 * Manage preparer profile: PTIN, firm name/EIN/address, license numbers.
 * This information appears on audit trail documents and cover pages.
 */

import { useState, useEffect } from 'react';
import {
  User, Building2, ShieldCheck, Save, Check, AlertTriangle, Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  loadPreparerSettings,
  savePreparerSettings,
  validatePTIN,
  buildSignatureBlock,
  PreparerSettings,
  DEFAULT_PREPARER_SETTINGS,
} from '@/lib/preparerSettings';

function Field({
  label, hint, value, onChange, placeholder, maxLength, className,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground/60 mb-1">{hint}</p>}
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="h-8 text-sm mt-1"
      />
    </div>
  );
}

export function PreparerSettingsPage() {
  const [settings, setSettings] = useState<PreparerSettings>(DEFAULT_PREPARER_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadPreparerSettings());
  }, []);

  const set = (key: keyof PreparerSettings, val: string) => {
    setSettings(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  };

  const handleSave = () => {
    savePreparerSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const ptinValidation = validatePTIN(settings.ptin);
  const signaturePreview = buildSignatureBlock(settings);

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Preparer Settings</h1>
        <p className="text-muted-foreground mt-1">
          Your PTIN and firm information — printed on all audit trail documents and cover pages.
        </p>
      </div>

      {/* PTIN notice */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              IRS regulations require all paid preparers to include their PTIN on every federal return they prepare (IRC §6109). PTINs must be renewed annually at <strong>irs.gov/ptin</strong>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Preparer identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" />
            Preparer Identity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Full Legal Name"
              placeholder="Jane Smith"
              value={settings.preparerName}
              onChange={v => set('preparerName', v)}
              className="col-span-2"
            />
            <div>
              <Label className="text-xs text-muted-foreground">
                PTIN
                {settings.ptin && (
                  <span className={`ml-2 text-xs ${ptinValidation.valid ? 'text-status-success' : 'text-status-error'}`}>
                    {ptinValidation.valid ? '✓ Valid format' : ptinValidation.message}
                  </span>
                )}
              </Label>
              <Input
                value={settings.ptin}
                onChange={e => set('ptin', e.target.value.toUpperCase())}
                placeholder="P12345678"
                maxLength={9}
                className="h-8 text-sm mt-1 font-mono"
              />
            </div>
            <Field
              label="EA Enrollment Number"
              hint="Enrolled Agents only"
              placeholder="12345"
              value={settings.eaEnrollmentNumber}
              onChange={v => set('eaEnrollmentNumber', v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="CPA License Number"
              hint="CPAs only"
              placeholder="12345"
              value={settings.cpaLicenseNumber}
              onChange={v => set('cpaLicenseNumber', v)}
            />
            <Field
              label="CPA License State"
              placeholder="CA"
              maxLength={2}
              value={settings.cpaLicenseState}
              onChange={v => set('cpaLicenseState', v.toUpperCase())}
            />
          </div>
        </CardContent>
      </Card>

      {/* Firm info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Firm Information
          </CardTitle>
          <CardDescription>Leave blank if you prepare returns as a sole proprietor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Firm / Practice Name"
              placeholder="Smith &amp; Associates CPA"
              value={settings.firmName}
              onChange={v => set('firmName', v)}
              className="col-span-2"
            />
            <div>
              <Label className="text-xs text-muted-foreground">Firm EIN</Label>
              <Input
                value={settings.firmEIN}
                onChange={e => set('firmEIN', e.target.value)}
                placeholder="12-3456789"
                maxLength={10}
                className="h-8 text-sm mt-1 font-mono"
              />
            </div>
            <Field
              label="EFIN"
              hint="Electronic Filing ID Number (optional)"
              placeholder="123456"
              maxLength={6}
              value={settings.efin}
              onChange={v => set('efin', v)}
            />
          </div>

          <Field
            label="Street Address"
            placeholder="123 Main St, Suite 100"
            value={settings.firmAddress}
            onChange={v => set('firmAddress', v)}
          />

          <div className="grid grid-cols-3 gap-3">
            <Field
              label="City"
              placeholder="San Francisco"
              value={settings.firmCity}
              onChange={v => set('firmCity', v)}
              className="col-span-1"
            />
            <Field
              label="State"
              placeholder="CA"
              maxLength={2}
              value={settings.firmState}
              onChange={v => set('firmState', v.toUpperCase())}
            />
            <Field
              label="ZIP"
              placeholder="94105"
              maxLength={10}
              value={settings.firmZip}
              onChange={v => set('firmZip', v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Phone"
              placeholder="(415) 555-0100"
              value={settings.firmPhone}
              onChange={v => set('firmPhone', v)}
            />
            <Field
              label="Email"
              placeholder="jane@smithcpa.com"
              value={settings.firmEmail}
              onChange={v => set('firmEmail', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Custom signature block */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Signature Block Override
          </CardTitle>
          <CardDescription>
            Optional. If set, this replaces the auto-generated signature block on documents.
            Leave blank to auto-generate from the fields above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={settings.signatureBlock}
            onChange={e => set('signatureBlock', e.target.value)}
            placeholder="Custom multi-line signature block..."
            className="text-sm font-mono h-24"
          />
        </CardContent>
      </Card>

      {/* Preview */}
      {signaturePreview && (
        <Card className="bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Signature Block Preview</CardTitle>
            <CardDescription>This appears on audit trail documents and cover pages.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80 leading-relaxed">
              {settings.signatureBlock || signaturePreview}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave}>
          {saved ? (
            <><Check className="w-4 h-4 mr-2 text-status-success" /> Saved</>
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Save Settings</>
          )}
        </Button>
        {!settings.ptin && (
          <div className="flex items-center gap-1.5 text-xs text-status-warning">
            <AlertTriangle className="w-3.5 h-3.5" />
            PTIN not entered — required on all paid federal returns
          </div>
        )}
      </div>
    </div>
  );
}
