import { getInternalStaticDataSlice } from "../../../services/internalStaticDataService";

export const carregarDadosDashboard = async (force = false) => {
  const staticData = await getInternalStaticDataSlice(
    (payload) => payload?.dashboard?.data ?? null,
    { force },
  );

  if (!staticData) {
    throw new Error("JSON interno indisponivel para o dashboard.");
  }

  return { data: staticData, fromStatic: true };
};
