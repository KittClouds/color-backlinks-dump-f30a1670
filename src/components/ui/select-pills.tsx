
import * as React from "react"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface SelectPillsData {
  id: string
  name: string
  color?: string
}

interface SelectPillsProps {
  data: SelectPillsData[]
  value: string[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  className?: string
}

export function SelectPills({
  data,
  value,
  onValueChange,
  placeholder = "Search items...",
  className
}: SelectPillsProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const filteredData = data.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  const selectedItems = data.filter(item => value.includes(item.id))

  const handleSelect = (itemId: string) => {
    const newValue = value.includes(itemId)
      ? value.filter(id => id !== itemId)
      : [...value, itemId]
    onValueChange(newValue)
  }

  const handleRemove = (itemId: string) => {
    onValueChange(value.filter(id => id !== itemId))
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Selected Pills */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedItems.map(item => (
            <Badge
              key={item.id}
              variant="secondary"
              className="text-xs flex items-center gap-1"
              style={item.color ? { backgroundColor: item.color, color: 'white' } : undefined}
            >
              {item.name}
              <X
                className="h-3 w-3 cursor-pointer hover:opacity-70"
                onClick={() => handleRemove(item.id)}
              />
            </Badge>
          ))}
        </div>
      )}

      {/* Search/Add Interface */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="min-h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer hover:bg-accent">
            {placeholder}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder={placeholder}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No items found.</CommandEmpty>
              <CommandGroup>
                {filteredData.map(item => (
                  <CommandItem
                    key={item.id}
                    onSelect={() => handleSelect(item.id)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {item.color && (
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                      )}
                      <span>{item.name}</span>
                    </div>
                    {value.includes(item.id) && (
                      <Check className="h-4 w-4" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
