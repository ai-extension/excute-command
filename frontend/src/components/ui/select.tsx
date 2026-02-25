import * as React from "react"
import { cn } from "../../lib/utils"

const Select = ({ children, value, onValueChange }: any) => {
    return (
        <div className="relative w-full">
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(child as React.ReactElement<any>, { value, onValueChange });
                }
                return child;
            })}
        </div>
    )
}

const SelectTrigger = ({ children, className }: any) => <div className={className}>{children}</div>
const SelectValue = ({ placeholder, value }: any) => null

const SelectContent = ({ children, value, onValueChange }: any) => {
    return (
        <select
            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {children}
        </select>
    );
}

const SelectItem = ({ children, value }: any) => (
    <option value={value}>
        {children}
    </option>
)

const SelectGroup = React.Fragment
const SelectLabel = React.Fragment
const SelectSeparator = React.Fragment

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator }
