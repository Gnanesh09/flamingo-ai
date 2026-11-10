import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionRouter from "./session";
import flamingoRouter from "./flamingo";
import portalRouter from "./portal";
import commerceRouter from "./commerce";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commerceRouter);
router.use(sessionRouter);
router.use(portalRouter);
router.use(flamingoRouter);

export default router;
