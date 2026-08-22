import { Component } from "react";
import ErrorPage from "./ErrorPage";

class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[AppErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorPage code="500" />;
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;

