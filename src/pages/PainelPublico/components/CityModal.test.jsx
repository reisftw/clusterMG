import { fireEvent, render, screen } from "@testing-library/react";
import CityModal from "./CityModal";

const mocks = vi.hoisted(() => ({
  gerarPDFCidade: vi.fn(),
  gerarRelatorio3Meses: vi.fn(),
}));

vi.mock("../utils/pdfAgentes", () => ({
  gerarPDFCidade: mocks.gerarPDFCidade,
  gerarRelatorio3Meses: mocks.gerarRelatorio3Meses,
}));

const cidade = {
  nome: "Belo Horizonte",
  pct: 82,
  cancelamentos: 100,
  meta80: 80,
  realizado: 82,
  falta: -2,
  daily: [1, 2, 0],
};

describe("CityModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("nao renderiza sem cidade", () => {
    const { container } = render(
      <CityModal
        cidade={null}
        month="Janeiro"
        allData={{}}
        onClose={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("fecha no ESC e dispara os relatorios", () => {
    const onClose = vi.fn();

    render(
      <CityModal
        cidade={cidade}
        month="Janeiro"
        allData={{ Janeiro: { cidades: [cidade] } }}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Belo Horizonte")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();

    const btns = screen.getAllByRole("button", { name: /relat.rio 3 meses/i });
    fireEvent.click(btns[btns.length - 1]);
    expect(mocks.gerarRelatorio3Meses).toHaveBeenCalledWith(
      "Belo Horizonte",
      "Janeiro",
      { Janeiro: { cidades: [cidade] } },
    );

    const btnsMes = screen.getAllByRole("button", {
      name: /relat.rio do m.s/i,
    });
    fireEvent.click(btnsMes[btnsMes.length - 1]);
    expect(mocks.gerarPDFCidade).toHaveBeenCalledWith(
      "Belo Horizonte",
      "Janeiro",
      { Janeiro: { cidades: [cidade] } },
    );
  });
});
