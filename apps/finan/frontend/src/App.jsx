import { Navigate, Route, Routes } from "react-router-dom";
import FinanLayout from "./components/FinanLayout";
import FinanLoginPage from "./components/FinanLoginPage";
import FinanModulePage from "./components/FinanModulePage";
import FinanSettingsPage from "./components/FinanSettingsPage";
import { useFinanAuth } from "./state/FinanAuthContext";
import { FINAN_ROUTES } from "./routes";

function Protected({ children }) {
	const { user, loading } = useFinanAuth();
	if (loading) return <div className="finan-loading">Carregando Finan...</div>;
	if (!user) return <Navigate to={FINAN_ROUTES.LOGIN} replace />;
	return children;
}

export default function App() {
	return (
		<Routes>
			<Route path={FINAN_ROUTES.LOGIN} element={<FinanLoginPage />} />
			<Route
				path="/"
				element={
					<Protected>
						<FinanLayout />
					</Protected>
				}
			>
				<Route index element={<FinanModulePage page="dashboard" />} />
				<Route
					path="gestao-orcamentaria"
					element={<FinanModulePage page="gestao-orcamentaria" />}
				/>
				<Route
					path="dados-orcamentarios"
					element={<FinanModulePage page="dados-orcamentarios" />}
				/>
				<Route path="orcamento" element={<FinanModulePage page="orcamento" />} />
				<Route path="dre" element={<FinanModulePage page="dre" />} />
				<Route path="aprovacoes" element={<FinanModulePage page="aprovacoes" />} />
				<Route
					path="contas-a-pagar"
					element={<FinanModulePage page="contas-a-pagar" />}
				/>
				<Route
					path="contas-a-receber"
					element={<FinanModulePage page="contas-a-receber" />}
				/>
				<Route path="faturamento" element={<FinanModulePage page="faturamento" />} />
				<Route path="notas" element={<FinanModulePage page="notas" />} />
				<Route path="reports" element={<FinanModulePage page="reports" />} />
				<Route path="equipe" element={<FinanModulePage page="equipe" />} />
				<Route path="configuracao-geral" element={<FinanSettingsPage />} />
			</Route>
		</Routes>
	);
}
