export interface WorkbenchRouteRequest {
  method?: string;
  url: string;
  body?: string;
}

export interface WorkbenchRouteResponse {
  status: number;
  content_type: string;
  body: string;
}
