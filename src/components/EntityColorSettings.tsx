
import React from 'react';
import { useAtom } from 'jotai';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { entityColorPreferencesAtom, getKnownEntityKinds, COLOR_PRESETS, DEFAULT_ENTITY_COLORS, getEntityColor } from '@/lib/entityColors';
import { RotateCcw } from 'lucide-react';

export function EntityColorSettings() {
  const [colorPreferences, setColorPreferences] = useAtom(entityColorPreferencesAtom);
  const entityKinds = getKnownEntityKinds();

  const handleColorChange = (kind: string, colorClass: string) => {
    setColorPreferences(prev => ({
      ...prev,
      [kind]: colorClass
    }));
  };

  const resetToDefaults = () => {
    setColorPreferences({});
  };

  const resetKind = (kind: string) => {
    setColorPreferences(prev => {
      const newPrefs = { ...prev };
      delete newPrefs[kind];
      return newPrefs;
    });
  };

  // Custom display names for special types
  const getDisplayName = (kind: string) => {
    if (kind === 'BACKLINK') return 'Backlinks';
    return kind;
  };

  // Custom preview for backlinks
  const getPreviewContent = (kind: string) => {
    if (kind === 'BACKLINK') return '<<Example>>';
    return kind;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Entity Colors</CardTitle>
            <CardDescription>
              Customize the visual appearance of different entity types and backlinks
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={resetToDefaults}
            className="flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {entityKinds.map((kind) => {
          const currentColor = getEntityColor(kind, colorPreferences);
          const isCustomized = kind in colorPreferences;
          
          return (
            <div key={kind} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <Badge className={`${currentColor} min-w-0`}>
                  {getPreviewContent(kind)}
                </Badge>
                <span className="text-sm font-medium">{getDisplayName(kind)}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Select
                  value={colorPreferences[kind] || ''}
                  onValueChange={(value) => handleColorChange(kind, value)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(COLOR_PRESETS).map(([name, colorClass]) => (
                      <SelectItem key={name} value={colorClass}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded ${colorClass.split(' ')[0]}`} />
                          {name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {isCustomized && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resetKind(kind)}
                    className="h-8 w-8 p-0"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-2">Color Legend</h4>
          <div className="flex flex-wrap gap-2">
            {entityKinds.map((kind) => {
              const colorClass = getEntityColor(kind, colorPreferences);
              return (
                <Badge key={kind} className={`${colorClass} text-xs`}>
                  {getPreviewContent(kind)}
                </Badge>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
