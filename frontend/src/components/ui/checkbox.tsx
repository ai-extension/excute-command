import * as React from "react"

const Checkbox = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
    return (
        <input
            type="checkbox"
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-2 transition-all cursor-pointer accent-primary"
            ref={ref}
            {...props}
        />
    )
})
Checkbox.displayName = "Checkbox"

export { Checkbox }
