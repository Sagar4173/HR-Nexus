import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs tracking-[0.2em] text-indigo-500 uppercase">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Record not found
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          The page or ticket does not exist, or your role does not have access to it. Restricted
          Employee Relations cases are only visible to authorised roles.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/" className="btn-primary">
            Back to dashboard
          </Link>
          <Link href="/tickets" className="btn-secondary">
            Ticket queue
          </Link>
        </div>
      </div>
    </div>
  );
}
