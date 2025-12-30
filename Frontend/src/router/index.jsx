import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import ScanPage from "../pages/ScanPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/scan",
    element: <ScanPage />,
  },
]);

export default router;
