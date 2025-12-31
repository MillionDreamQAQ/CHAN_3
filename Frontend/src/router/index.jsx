import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import ChartPage from "../pages/ChartPage";
import ScanPage from "../pages/ScanPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <ChartPage />,
      },
      {
        path: "scan",
        element: <ScanPage />,
      },
    ],
  },
]);

export default router;
