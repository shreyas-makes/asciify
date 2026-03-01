import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { User } from "@/types"

export function UserInfo({
  user,
  showEmail = false,
}: {
  user: User
  showEmail?: boolean
}) {
  return (
    <>
      <Avatar className="h-8 w-8 overflow-hidden rounded-full">
        <AvatarImage src={user.avatar} alt={user.name} />
        <AvatarFallback className="rounded-lg bg-neutral-200 text-[11px] text-black dark:bg-neutral-700 dark:text-white">
          {"¯\\_(ツ)_/¯"}
        </AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        {showEmail && (
          <span className="text-muted-foreground truncate text-xs">
            {user.email}
          </span>
        )}
      </div>
    </>
  )
}
