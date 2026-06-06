import { LinkButton } from "@/components/ui/link-button";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
        Plan your group trip
      </h1>
      <p className="mt-4 max-w-md text-lg text-gray-600">
        Coordinate who&apos;s coming, where everyone sleeps, and which
        activities you&apos;re joining — all in one place.
      </p>
      <div className="mt-8 flex gap-3">
        <LinkButton href="/signup" size="lg">Get started</LinkButton>
        <LinkButton href="/login" variant="outline" size="lg">Sign in</LinkButton>
      </div>
    </main>
  );
}
