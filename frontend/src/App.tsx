import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SkeletonLoader } from './components/SkeletonLoader';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { LocaleProvider } from './i18n/LocaleContext';

const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const VerifyEmailPage = lazy(() =>
  import('./pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const BillingPage = lazy(() => import('./pages/BillingPage').then((m) => ({ default: m.BillingPage })));
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const TeamPage = lazy(() => import('./pages/TeamPage').then((m) => ({ default: m.TeamPage })));
const AchievementsPage = lazy(() =>
  import('./pages/AchievementsPage').then((m) => ({ default: m.AchievementsPage })),
);
const LeaderboardsPage = lazy(() =>
  import('./pages/LeaderboardsPage').then((m) => ({ default: m.LeaderboardsPage })),
);
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const ApiDocsPage = lazy(() =>
  import('./pages/ApiDocsPage').then((m) => ({ default: m.ApiDocsPage })),
);
const MatchPage = lazy(() => import('./pages/MatchPage').then((m) => ({ default: m.MatchPage })));
const DemoWatchPage = lazy(() =>
  import('./pages/DemoWatchPage').then((m) => ({ default: m.DemoWatchPage })),
);
const PlayerPage = lazy(() => import('./pages/PlayerPage').then((m) => ({ default: m.PlayerPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const ComparePage = lazy(() => import('./pages/ComparePage').then((m) => ({ default: m.ComparePage })));
const GrenadeLabPage = lazy(() =>
  import('./pages/GrenadeLabPage').then((m) => ({ default: m.GrenadeLabPage })),
);
const TournamentsPage = lazy(() =>
  import('./pages/TournamentsPage').then((m) => ({ default: m.TournamentsPage })),
);

const AcademyLayout = lazy(() => import('./academy/AcademyLayout').then((m) => ({ default: m.AcademyLayout })));
const HomePage = lazy(() => import('./pages/academy/HomePage').then((m) => ({ default: m.HomePage })));
const UploadPage = lazy(() => import('./pages/academy/UploadPage').then((m) => ({ default: m.UploadPage })));
const MatchesPage = lazy(() => import('./pages/academy/MatchesPage').then((m) => ({ default: m.MatchesPage })));
const MatchHubPage = lazy(() => import('./pages/academy/match/MatchHubPage').then((m) => ({ default: m.MatchHubPage })));
const PlayersPage = lazy(() => import('./pages/academy/PlayersPage').then((m) => ({ default: m.PlayersPage })));
const PlayerProfilePage = lazy(() => import('./pages/academy/PlayerProfilePage').then((m) => ({ default: m.PlayerProfilePage })));
const TeamsPage = lazy(() => import('./pages/academy/TeamsPage').then((m) => ({ default: m.TeamsPage })));
const TeamProfilePage = lazy(() => import('./pages/academy/TeamsPage').then((m) => ({ default: m.TeamProfilePage })));
const AcademyComparePage = lazy(() => import('./pages/academy/ComparePage').then((m) => ({ default: m.AcademyComparePage })));
const ScoutingPage = lazy(() => import('./pages/academy/ScoutingPage').then((m) => ({ default: m.ScoutingPage })));
const LineupsPage = lazy(() => import('./pages/academy/LineupsPage').then((m) => ({ default: m.LineupsPage })));
const BoardsPage = lazy(() => import('./pages/academy/BoardsPage').then((m) => ({ default: m.BoardsPage })));
const BoardPage = lazy(() => import('./pages/academy/BoardPage').then((m) => ({ default: m.BoardPage })));
const TrainingPage = lazy(() => import('./pages/academy/TrainingPage').then((m) => ({ default: m.TrainingPage })));
const AnalystsPage = lazy(() => import('./pages/academy/AnalystsPage').then((m) => ({ default: m.AnalystsPage })));
const AcademyAdminPage = lazy(() => import('./pages/academy/AcademyAdminPage').then((m) => ({ default: m.AcademyAdminPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (error && typeof error === 'object' && 'response' in error) {
          const status = (error as { response?: { status?: number } }).response?.status;
          if (status && status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function PageFallback() {
  return (
    <div className="space-y-6 p-4">
      <SkeletonLoader variant="text" count={2} />
      <SkeletonLoader variant="card" count={3} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                {/* Academy workspace */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AcademyLayout />}>
                    <Route path="/dashboard" element={<HomePage />} />
                    <Route path="/upload" element={<UploadPage />} />
                    <Route path="/matches" element={<MatchesPage />} />
                    <Route path="/match/:matchId" element={<MatchHubPage />} />
                    <Route path="/players" element={<PlayersPage />} />
                    <Route path="/players/:name" element={<PlayerProfilePage />} />
                    <Route path="/teams" element={<TeamsPage />} />
                    <Route path="/teams/:name" element={<TeamProfilePage />} />
                    <Route path="/compare" element={<AcademyComparePage />} />
                    <Route path="/scouting" element={<ScoutingPage />} />
                    <Route path="/lineups" element={<LineupsPage />} />
                    <Route path="/boards" element={<BoardsPage />} />
                    <Route path="/boards/:boardId" element={<BoardPage />} />
                    <Route path="/training" element={<TrainingPage />} />
                    <Route path="/analysts" element={<AnalystsPage />} />
                    <Route path="/academy/admin" element={<AcademyAdminPage />} />
                  </Route>
                </Route>

                <Route element={<Layout />}>
                  {/* Public */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
                  <Route path="/verify-email/:token" element={<VerifyEmailPage />} />

                  {/* Classic analyzer (2D/3D studio, utility lab) */}
                  <Route element={<ProtectedRoute />}>
                    <Route path="/match/:matchId/replay" element={<MatchPage />} />
                    <Route path="/match/:matchId/watch" element={<DemoWatchPage />} />
                    <Route path="/match/:matchId/player/:playerName" element={<PlayerPage />} />
                    <Route path="/legacy/compare" element={<ComparePage />} />
                    <Route path="/utility-lab" element={<GrenadeLabPage />} />
                    <Route path="/history" element={<HistoryPage />} />
                    <Route path="/legacy/dashboard" element={<DashboardPage />} />
                    <Route path="/billing" element={<BillingPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/profile" element={<Navigate to="/settings" replace />} />
                    <Route path="/team" element={<TeamPage />} />
                    <Route path="/achievements" element={<AchievementsPage />} />
                    <Route path="/leaderboards" element={<LeaderboardsPage />} />
                    <Route path="/tournaments" element={<TournamentsPage />} />
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/api-docs" element={<ApiDocsPage />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster
            position="top-right"
            theme="dark"
            toastOptions={{
              style: {
                background: '#101012',
                border: '1px solid rgba(244,240,230,0.12)',
                color: '#f4f0e6',
              },
            }}
          />
          </AuthProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
