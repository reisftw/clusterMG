const express = require("express");
const service = require("../storeDeliveriesService");

function createStoreDeliveriesRouter({
  requireAnyPermission,
  requireAuthenticated,
  requireCsrfToken,
} = {}) {
  const router = express.Router();
  const guard = (key, roles = ["admin"]) =>
    requireAnyPermission(service.PERMISSIONS[key], roles);
  router.get(
    "/clients/search",
    requireAuthenticated,
    guard("create", [
      "admin",
      "atendente_loja",
      "supervisor_loja",
      "coordenador_loja",
    ]),
    async (req, res, next) => {
      try {
        res.json(await service.searchClients(req.query.q));
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/mine",
    requireAuthenticated,
    guard("mine", [
      "admin",
      "atendente_loja",
      "supervisor_loja",
      "coordenador_loja",
    ]),
    async (req, res, next) => {
      try {
        res.json(await service.listDeliveries(req.query, req.user, "mine"));
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/history",
    requireAuthenticated,
    requireAnyPermission(
      ["loja.historico.view", "loja.entregas.store"],
      ["admin", "supervisor_loja", "coordenador_loja"],
    ),
    async (req, res, next) => {
      try {
        res.json(await service.listDeliveries(req.query, req.user, "history"));
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/stores",
    requireAuthenticated,
    guard("create", [
      "admin",
      "atendente_loja",
      "supervisor_loja",
      "coordenador_loja",
    ]),
    async (req, res, next) => {
      try {
        res.json(await service.listStores(req.user));
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/stores/users",
    requireAuthenticated,
    guard("stores", ["admin", "coordenador_loja"]),
    async (req, res, next) => {
      try {
        res.json(await service.listStoreUsers(req.user));
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/stores",
    requireAuthenticated,
    requireCsrfToken,
    guard("stores", ["admin", "coordenador_loja"]),
    async (req, res, next) => {
      try {
        res.status(201).json(await service.saveStore(req.body, req.user));
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/stores/:id/users",
    requireAuthenticated,
    requireCsrfToken,
    guard("stores", ["admin", "coordenador_loja"]),
    async (req, res, next) => {
      try {
        res.json(
          await service.assignStoreUser(req.params.id, req.body, req.user),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/:id/download",
    requireAuthenticated,
    guard("protocols", [
      "admin",
      "atendente_loja",
      "supervisor_loja",
      "coordenador_loja",
    ]),
    async (req, res, next) => {
      try {
        const file = await service.download(req.params.id, req.user);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${String(file.pdf_filename || "comprovante.pdf").replace(/[^a-zA-Z0-9._-]/g, "-")}"`,
        );
        res.send(file.pdf_data);
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/:id",
    requireAuthenticated,
    guard("protocols", [
      "admin",
      "atendente_loja",
      "supervisor_loja",
      "coordenador_loja",
    ]),
    async (req, res, next) => {
      try {
        res.json(await service.getDelivery(req.params.id, req.user));
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/",
    requireAuthenticated,
    requireCsrfToken,
    guard("create", [
      "admin",
      "atendente_loja",
      "supervisor_loja",
      "coordenador_loja",
    ]),
    async (req, res, next) => {
      try {
        res.status(201).json(await service.createDelivery(req.body, req.user));
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}

module.exports = createStoreDeliveriesRouter;
