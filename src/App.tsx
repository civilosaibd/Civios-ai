import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import ScrollToTop from "./components/ScrollToTop";
import ReferralCapture, { RegisterRedirect } from "./components/ReferralCapture";
import AppLoading from "./components/AppLoading";
import InstallCivilOS from "./components/InstallCivilOS";
import UpdateAvailable from "./components/UpdateAvailable";
import { PwaProvider } from "@/lib/pwa";
import FloatingAssistant from "@/components/FloatingAssistant";
import { UnitsProvider } from "@/lib/UnitsContext";

const Index = lazy(() => import("./pages/Index.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const UploadPage = lazy(() => import("./pages/UploadPage.tsx"));
const EstimatePage = lazy(() => import("./pages/EstimatePage.tsx"));
const AboutPage = lazy(() => import("./pages/AboutPage.tsx"));
const ContactPage = lazy(() => import("./pages/ContactPage.tsx"));
const AuthPage = lazy(() => import("./pages/AuthPage.tsx"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage.tsx"));
const ProfilePage = lazy(() => import("./pages/ProfilePage.tsx"));
const SponsorPage = lazy(() => import("./pages/SponsorPage.tsx"));
const AdminPage = lazy(() => import("./pages/AdminPage.tsx"));
const SharedEstimatePage = lazy(() => import("./pages/SharedEstimatePage.tsx"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.tsx"));
const AIAssistantPage = lazy(() => import("./pages/AIAssistantPage.tsx"));
const AIWriterPage = lazy(() => import("./pages/AIWriterPage.tsx"));
const SitePhotosPage = lazy(() => import("./pages/SitePhotosPage.tsx"));
const FileAssistantPage = lazy(() => import("./pages/FileAssistantPage.tsx"));
const BOQGeneratorPage = lazy(() => import("./pages/BOQGeneratorPage.tsx"));
const TenderAnalysisPage = lazy(() => import("./pages/TenderAnalysisPage.tsx"));
const TenderDocumentCheckerPage = lazy(() => import("./pages/TenderDocumentCheckerPage.tsx"));
const SiteDiaryPage = lazy(() => import("./pages/SiteDiaryPage.tsx"));
const PlanGeneratorPage = lazy(() => import("./pages/PlanGeneratorPage.tsx"));
const BimStudioPage = lazy(() => import("./pages/BimStudioPage.tsx"));
const SiteGeoPage = lazy(() => import("./pages/SiteGeoPage.tsx"));
const SchedulerPage = lazy(() => import("./pages/SchedulerPage.tsx"));
const EquipmentPage = lazy(() => import("./pages/EquipmentPage.tsx"));
const InventoryPage = lazy(() => import("./pages/InventoryPage.tsx"));
const UserAgentPage = lazy(() => import("./pages/UserAgentPage.tsx"));
const AdminAgentPage = lazy(() => import("./pages/AdminAgentPage.tsx"));
const ComingSoonPage = lazy(() => import("./pages/ComingSoonPage.tsx"));
const AIEngineerPage = lazy(() => import("./pages/AIEngineerPage.tsx"));
const BOQHubPage = lazy(() => import("./pages/BOQHubPage.tsx"));
const RateAnalysisPage = lazy(() => import("./pages/RateAnalysisPage.tsx"));
const BBSGeneratorPage = lazy(() => import("./pages/BBSGeneratorPage.tsx"));
const SiteInspectionPage = lazy(() => import("./pages/SiteInspectionPage.tsx"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage.tsx"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage.tsx"));
const NotificationSettingsPage = lazy(
  () => import("./pages/NotificationSettingsPage.tsx")
);
const AffiliatePage = lazy(() => import("./pages/AffiliatePage.tsx"));
const AdminAffiliatePage = lazy(() => import("./pages/AdminAffiliatePage.tsx"));
const InviteAcceptPage = lazy(() => import("./pages/InviteAcceptPage.tsx"));
const ModulesPage = lazy(() => import("./pages/ModulesPage.tsx"));
const BillingPage = lazy(() => import("./pages/BillingPage.tsx"));
const AdminBillingPage = lazy(() => import("./pages/AdminBillingPage.tsx"));
const FinancePage = lazy(() => import("./pages/FinancePage.tsx"));
const DefectDetectionPage = lazy(() => import("./pages/DefectDetectionPage.tsx"));
const KnowledgeLibraryPage = lazy(
  () => import("./pages/KnowledgeLibraryPage.tsx")
);
const TrainingCornerPage = lazy(
  () => import("./pages/TrainingCornerPage.tsx")
);
const MaterialCalculatorPage = lazy(
  () => import("./pages/MaterialCalculatorPage.tsx")
);
const VisualizationsPage = lazy(
  () => import("./pages/VisualizationsPage.tsx")
);
const VisualizationWorkspacePage = lazy(
  () => import("./pages/VisualizationWorkspacePage.tsx")
);
const BackupPage = lazy(() => import("./pages/BackupPage.tsx"));
const ReportsPage = lazy(() => import("./pages/ReportsPage.tsx"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <UnitsProvider>
        <ThemeProvider>
          <PwaProvider>
            <AuthProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />

                <BrowserRouter>
                  <ScrollToTop />
                  <ReferralCapture />
                  <InstallCivilOS />
                  <FloatingAssistant />
                  <UpdateAvailable />

                  <Suspense fallback={<AppLoading compact />}>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/upload" element={<UploadPage />} />
                      <Route path="/estimate/demo" element={<EstimatePage />} />
                      <Route path="/about" element={<AboutPage />} />
                      <Route path="/contact" element={<ContactPage />} />
                      <Route path="/auth" element={<AuthPage />} />
                      <Route
                        path="/register"
                        element={<RegisterRedirect />}
                      />

                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route
                        path="/projects/:id"
                        element={<ProjectDetailPage />}
                      />
                      <Route path="/modules" element={<ModulesPage />} />
                      <Route path="/dashboard" element={<DashboardPage />} />

                      <Route
                        path="/ai-assistant"
                        element={<AIAssistantPage />}
                      />
                      <Route path="/ai-writer" element={<AIWriterPage />} />
                      <Route path="/ai-engineer" element={<AIEngineerPage />} />
                      <Route path="/boq-hub" element={<BOQHubPage />} />
                      <Route
                        path="/rate-analysis"
                        element={<RateAnalysisPage />}
                      />
                      <Route path="/bbs" element={<BBSGeneratorPage />} />
                      <Route
                        path="/inspections"
                        element={<SiteInspectionPage />}
                      />
                      <Route
                        path="/file-assistant"
                        element={<FileAssistantPage />}
                      />
                      <Route path="/boq" element={<BOQGeneratorPage />} />
                      <Route path="/tender" element={<TenderAnalysisPage />} />
                      <Route path="/tender-docs" element={<TenderDocumentCheckerPage />} />
                      <Route path="/site-diary" element={<SiteDiaryPage />} />
                      <Route path="/site-photos" element={<SitePhotosPage />} />
                      <Route
                        path="/plan-generator"
                        element={<PlanGeneratorPage />}
                      />
                      <Route path="/bim-studio" element={<BimStudioPage />} />

                      <Route
                        path="/visualizations"
                        element={<VisualizationsPage />}
                      />
                      <Route
                        path="/visualizations/:id"
                        element={<VisualizationWorkspacePage />}
                      />

                      <Route path="/site-geo" element={<SiteGeoPage />} />
                      <Route path="/scheduler" element={<SchedulerPage />} />

                      <Route path="/inventory" element={<InventoryPage />} />
                      <Route
                        path="/requisitions"
                        element={<InventoryPage />}
                      />
                      <Route
                        path="/purchase-orders"
                        element={<InventoryPage />}
                      />
                      <Route path="/vendors" element={<InventoryPage />} />
                      <Route path="/equipment" element={<EquipmentPage />} />

                      <Route
                        path="/defect-detection"
                        element={<DefectDetectionPage />}
                      />
                      <Route
                        path="/knowledge-library"
                        element={<KnowledgeLibraryPage />}
                      />
                      <Route
                        path="/training-corner"
                        element={<TrainingCornerPage />}
                      />
                      <Route
                        path="/material-calc"
                        element={<MaterialCalculatorPage />}
                      />

                      <Route path="/invoices" element={<FinancePage />} />
                      <Route
                        path="/contractor-bills"
                        element={<FinancePage />}
                      />
                      <Route path="/payments" element={<FinancePage />} />
                      <Route path="/cash-flow" element={<FinancePage />} />

                      <Route path="/agent" element={<UserAgentPage />} />
                      <Route
                        path="/admin/ai-agent"
                        element={<AdminAgentPage />}
                      />

                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="/sponsor" element={<SponsorPage />} />
                      <Route path="/admin" element={<AdminPage />} />

                      <Route
                        path="/notifications"
                        element={<NotificationsPage />}
                      />
                      <Route
                        path="/settings/notifications"
                        element={<NotificationSettingsPage />}
                      />
                      <Route
                        path="/settings/backup"
                        element={<BackupPage />}
                      />
                      <Route path="/reports" element={<ReportsPage />} />

                      <Route path="/affiliate" element={<AffiliatePage />} />
                      <Route
                        path="/admin/affiliate"
                        element={<AdminAffiliatePage />}
                      />
                      <Route path="/invite" element={<InviteAcceptPage />} />

                      <Route path="/billing" element={<BillingPage />} />
                      <Route
                        path="/admin/billing"
                        element={<AdminBillingPage />}
                      />

                      <Route
                        path="/share/:token"
                        element={<SharedEstimatePage />}
                      />

                      {/* Coming Soon stubs */}
                      {[
                        "ai-drawing",
                        "progress-reports",
                        "bid-prep",
                        "analytics",
                        "ai-insights",
                        "company-settings",
                      ].map((p) => (
                        <Route
                          key={p}
                          path={`/${p}`}
                          element={<ComingSoonPage />}
                        />
                      ))}

                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </BrowserRouter>
              </TooltipProvider>
            </AuthProvider>
          </PwaProvider>
        </ThemeProvider>
      </UnitsProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;