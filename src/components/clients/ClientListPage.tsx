/**
 * ClientListPage.tsx
 *
 * Lists all clients for the current preparer. Allows adding new clients
 * and navigating to a client's detail page.
 */

import { useState, useEffect } from 'react';
import {
  Users, Plus, Search, ChevronRight, Mail, Phone,
  AlertCircle, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Client, ClientFilingStatus } from '@/types/client';
import { listClients, createClient } from '@/lib/clientStorage';

interface Props {
  /** Called when user clicks a client row — navigate to detail */
  onSelect: (clientId: string) => void;
}

export function ClientListPage({ onSelect }: Props) {
  const [clients,  setClients]  = useState<Client[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // New client form state
  const [firstName,     setFirstName]     = useState('');
  const [lastName,      setLastName]      = useState('');
  const [email,         setEmail]         = useState('');
  const [phone,         setPhone]         = useState('');
  const [ssnLast4,      setSsnLast4]      = useState('');
  const [dateOfBirth,   setDateOfBirth]   = useState('');
  const [filingStatus,  setFilingStatus]  = useState<ClientFilingStatus | ''>('');
  const [occupation,    setOccupation]    = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city,          setCity]          = useState('');
  const [stateCode,     setStateCode]     = useState('');
  const [zip,           setZip]           = useState('');
  const [saving,        setSaving]        = useState(false);
  const [formError,     setFormError]     = useState<string | null>(null);

  useEffect(() => {
    listClients()
      .then(setClients)
      .catch(() => setError('Failed to load clients.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      c.firstName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q)  ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  });

  const handleCreate = async () => {
    setFormError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('First and last name are required.');
      return;
    }
    if (ssnLast4 && !/^\d{4}$/.test(ssnLast4)) {
      setFormError('SSN last 4 must be exactly 4 digits.');
      return;
    }
    setSaving(true);
    try {
      const client = await createClient({
        firstName:     firstName.trim(),
        lastName:      lastName.trim(),
        email:         email.trim()        || undefined,
        phone:         phone.trim()        || undefined,
        ssnLast4:      ssnLast4.trim()     || undefined,
        dateOfBirth:   dateOfBirth.trim()  || undefined,
        filingStatus:  filingStatus        || undefined,
        occupation:    occupation.trim()   || undefined,
        streetAddress: streetAddress.trim() || undefined,
        city:          city.trim()         || undefined,
        state:         stateCode.trim().toUpperCase() || undefined,
        zip:           zip.trim()          || undefined,
      });
      setClients(prev => [client, ...prev].sort((a, b) =>
        a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
      ));
      setShowForm(false);
      resetForm();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create client.');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFirstName(''); setLastName('');
    setEmail(''); setPhone(''); setSsnLast4('');
    setDateOfBirth(''); setFilingStatus(''); setOccupation('');
    setStreetAddress(''); setCity(''); setStateCode(''); setZip('');
    setFormError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading clients…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Clients</h2>
            <p className="text-sm text-muted-foreground">
              {clients.length} client{clients.length !== 1 ? 's' : ''} on file
            </p>
          </div>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Client
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {search ? `No clients match "${search}"` : 'No clients yet. Add your first client to get started.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(client => (
            <Card
              key={client.id}
              className="cursor-pointer hover:border-primary/60 transition-colors"
              onClick={() => onSelect(client.id)}
            >
              <CardContent className="flex items-center gap-4 py-4">
                {/* Avatar initials */}
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                  {client.firstName[0]}{client.lastName[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium">{client.lastName}, {client.firstName}</p>
                  <div className="flex items-center gap-4 mt-0.5">
                    {client.email && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                        <Mail className="w-3 h-3 shrink-0" />
                        {client.email}
                      </span>
                    )}
                    {client.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3 shrink-0" />
                        {client.phone}
                      </span>
                    )}
                    {client.ssnLast4 && (
                      <span className="text-xs text-muted-foreground">
                        SSN ***-**-{client.ssnLast4}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Client Dialog */}
      <Dialog open={showForm} onOpenChange={open => { setShowForm(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>
              Only first and last name are required. SSN: store the last 4 digits only.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cf-first">First name <span className="text-destructive">*</span></Label>
                <Input id="cf-first" value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-last">Last name <span className="text-destructive">*</span></Label>
                <Input id="cf-last" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-1.5">
              <Label htmlFor="cf-email">Email</Label>
              <Input id="cf-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@example.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cf-phone">Phone</Label>
                <Input id="cf-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-ssn">SSN last 4</Label>
                <Input
                  id="cf-ssn"
                  value={ssnLast4}
                  onChange={e => setSsnLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  maxLength={4}
                />
              </div>
            </div>

            <Separator />

            {/* Tax profile */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tax Profile</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cf-dob">Date of birth</Label>
                <Input id="cf-dob" type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Filing status</Label>
                <Select value={filingStatus} onValueChange={v => setFilingStatus(v as ClientFilingStatus)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="married_filing_jointly">Married Filing Jointly</SelectItem>
                    <SelectItem value="married_filing_separately">Married Filing Separately</SelectItem>
                    <SelectItem value="head_of_household">Head of Household</SelectItem>
                    <SelectItem value="qualifying_surviving_spouse">Qualifying Surviving Spouse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-occ">Occupation</Label>
              <Input id="cf-occ" value={occupation} onChange={e => setOccupation(e.target.value)} placeholder="Software Engineer" />
            </div>

            <Separator />

            {/* Address */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Address</p>
            <div className="space-y-1.5">
              <Label htmlFor="cf-addr">Street address</Label>
              <Input id="cf-addr" value={streetAddress} onChange={e => setStreetAddress(e.target.value)} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="cf-city">City</Label>
                <Input id="cf-city" value={city} onChange={e => setCity(e.target.value)} placeholder="Austin" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-state">State</Label>
                <Input id="cf-state" value={stateCode} onChange={e => setStateCode(e.target.value.toUpperCase())} placeholder="TX" maxLength={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-zip">ZIP</Label>
                <Input id="cf-zip" value={zip} onChange={e => setZip(e.target.value)} placeholder="78701" maxLength={10} />
              </div>
            </div>

            {formError && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {saving ? 'Saving…' : 'Add Client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
