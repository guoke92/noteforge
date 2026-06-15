/** Shown while editor session is restoring — avoids WelcomeView flash. */
export function EditorStartupPlaceholder() {
  return <div className="h-full bg-bg-primary" aria-hidden />;
}
