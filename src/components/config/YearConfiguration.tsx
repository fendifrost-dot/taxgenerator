import { useTaxYear } from '@/contexts/TaxYearContext';
import { TaxYearSelector } from '@/components/dashboard/TaxYearSelector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Building2, MapPin, Briefcase, Trash2, Plus, Lock } from 'lucide-react';
import { StateConfig, ResidencyStatus } from '@/types/tax';
import { useState } from 'react';

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];

const residencyLabels: Record<ResidencyStatus, string> = {
  full_year: 'Full-Year Resident',
  part_year: 'Part-Year Resident',
  nonresident: 'Nonresident',
};

export function YearConfiguration() {
  const { currentYear, yearConfig, addState, removeState, isYearSelected } = useTaxYear();
  const [selectedState, setSelectedState] = useState<string>('');
  const [residencyStatus, setResidencyStatus] = useState<ResidencyStatus>('full_year');
  const [hasBusinessNexus, setHasBusinessNexus] = useState(false);

  const configuredStateCodes = yearConfig?.states.map(s => s.stateCode) || [];
  const availableStates = US_STATES.filter(s => !configuredStateCodes.includes(s.code));

  const handleAddState = () => {
    if (!selectedState) return;
    const state = US_STATES.find(s => s.code === selectedState);
    if (!state) return;

    addState({
      stateCode: state.code,
      stateName: state.name,
      residencyStatus,
      hasBusinessNexus,
    });

    setSelectedState('');
    setResidencyStatus('full_year');
    setHasBusinessNexus(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Year Configuration
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure tax year settings, states, and residency status
        </p>
      </div>

      <TaxYearSelector />

      {isYearSelected && (
        <>
          <Separator />

          {/* State Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                State Tax Configuration
              </CardTitle>
              <CardDescription>
                Explicitly specify all states involved in tax year {currentYear}. 
                No defaults or assumptions are made.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Warning if no states configured */}
              {yearConfig?.states.length === 0 && (
                <div className="flex items-start gap-3 p-4 bg-status-warning/10 rounded-lg border border-status-warning/30">
                  <AlertTriangle className="w-5 h-5 text-status-warning mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">State Configuration Required</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      You must configure at least one state before state returns can be prepared.
                      This is a mandatory step with no defaults.
                    </p>
                  </div>
                </div>
              )}

              {/* Add State Form */}
              <div className="p-4 border rounded-lg space-y-4">
                <div className="text-sm font-medium">Add State</div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">State</Label>
                    <Select value={selectedState} onValueChange={setSelectedState}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select state..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStates.map(state => (
                          <SelectItem key={state.code} value={state.code}>
                            {state.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Residency Status</Label>
                    <Select 
                      value={residencyStatus} 
                      onValueChange={(v) => setResidencyStatus(v as ResidencyStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_year">Full-Year Resident</SelectItem>
                        <SelectItem value="part_year">Part-Year Resident</SelectItem>
                        <SelectItem value="nonresident">Nonresident</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Business Nexus</Label>
                    <div className="flex items-center gap-2 h-10">
                      <Switch
                        checked={hasBusinessNexus}
                        onCheckedChange={setHasBusinessNexus}
                      />
                      <span className="text-sm text-muted-foreground">
                        {hasBusinessNexus ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={handleAddState} 
                  disabled={!selectedState}
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add State
                </Button>
              </div>

              {/* Configured States List */}
              {yearConfig?.states && yearConfig.states.length > 0 && (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Configured States</div>
                  {yearConfig.states.map(state => (
                    <div
                      key={state.stateCode}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-secondary rounded-md flex items-center justify-center font-mono font-semibold text-sm">
                          {state.stateCode}
                        </div>
                        <div>
                          <div className="font-medium">{state.stateName}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              <MapPin className="w-3 h-3 mr-1" />
                              {residencyLabels[state.residencyStatus]}
                            </Badge>
                            {state.hasBusinessNexus && (
                              <Badge variant="outline" className="text-xs">
                                <Briefcase className="w-3 h-3 mr-1" />
                                Business Nexus
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeState(state.stateCode)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Locking Notice */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Year Locking
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Once all returns are finalized and you're ready to print, the tax year can be locked.
                    Locked years are immutable and outputs are exactly reproducible.
                    Locking is available from the Finalization section.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
