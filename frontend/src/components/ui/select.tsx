import * as React from "react"
import { cn } from "../../lib/utils"
import { ChevronDown } from "lucide-react"

const Select = ({ children, value, onValueChange }: any) => {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <div className="relative w-full group">
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(child as React.ReactElement<any>, {
                        value,
                        onValueChange,
                        isOpen,
                        setIsOpen
                    });
                }
                return child;
            })}
        </div>
    )
}

const SelectTrigger = ({ children, className, value, onValueChange }: any) => {
    // We find the SelectValue child to get the placeholder
    return (
        <div className={cn(
            "flex items-center justify-between w-full transition-all duration-200",
            className
        )}>
            {children}
            <ChevronDown className="w-3 h-3 ml-2 opacity-50 group-hover:opacity-100 transition-opacity" />
        </div>
    )
}

const SelectValue = ({ placeholder, value, children }: any) => {
    return <span className="truncate">{value || placeholder}</span>
}

const SelectContent = ({ children, value, onValueChange, className }: any) => {
    return (
        <select
            className={cn(
                "absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10",
                className
            )}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {children}
        </select>
    );
}

const SelectItem = ({ children, value }: any) => (
    <option value={value} className="bg-card text-foreground">
        {children}
    </option>
)

const SelectGroup = React.Fragment
const SelectLabel = React.Fragment
const SelectSeparator = React.Fragment

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator }
