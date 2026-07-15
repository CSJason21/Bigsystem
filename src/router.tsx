
import React, { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import MainLayout from './layouts/MainLayout';

// Lazy load page components
const UserControl = lazy(() => import('./pages/FederatedLearning/UserControl'));
const EdgeControl = lazy(() => import('./pages/FederatedLearning/EdgeControl'));
const CloudControl = lazy(() => import('./pages/FederatedLearning/CloudControl'));

const ResourceSensing = lazy(() => import('./pages/ComputingSchedule/ResourceSensing'));
const TaskManagement = lazy(() => import('./pages/ComputingSchedule/TaskManagement'));
const PredictionAllocation = lazy(() => import('./pages/ComputingSchedule/PredictionAllocation'));
const DemandForecast = lazy(() => import('./pages/ComputingSchedule/DemandForecast'));
const SecurityAssessment = lazy(() => import('./pages/ComputingSchedule/SecurityAssessment'));

const UserIdentification = lazy(() => import('./pages/FraudDetection/UserIdentification'));
const BehaviorTracking = lazy(() => import('./pages/FraudDetection/BehaviorTracking'));
const DataAnalysis = lazy(() => import('./pages/FraudDetection/DataAnalysis'));
const SituationAnalysis = lazy(() => import('./pages/FraudDetection/SituationAnalysis'));
const TextMining = lazy(() => import('./pages/FraudDetection/TextMining'));
const CommunicationMining = lazy(() => import('./pages/FraudDetection/CommunicationMining'));

const LazyLoad = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin size="large" /></div>}>
    <Component />
  </Suspense>
);

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to="/federated/user-control" replace /> },
      // Module 1: Reinforced Federated Learning Prototype System
      { path: 'federated/user-control', element: LazyLoad(UserControl) },
      { path: 'federated/edge-control', element: LazyLoad(EdgeControl) },
      { path: 'federated/cloud-control', element: LazyLoad(CloudControl) },
      // Module 2: Computing Network Intelligent Scheduling System
      { path: 'computing/resource-sensing', element: LazyLoad(ResourceSensing) },
      { path: 'computing/task-management', element: LazyLoad(TaskManagement) },
      { path: 'computing/prediction-allocation', element: LazyLoad(PredictionAllocation) },
      { path: 'computing/demand-forecast', element: LazyLoad(DemandForecast) },
      { path: 'computing/security-assessment', element: LazyLoad(SecurityAssessment) },
      // Module 3: Telecom Fraud Detection System
      { path: 'fraud/user-identification', element: LazyLoad(UserIdentification) },
      { path: 'fraud/behavior-tracking', element: LazyLoad(BehaviorTracking) },
      { path: 'fraud/data-analysis', element: LazyLoad(DataAnalysis) },
      { path: 'fraud/situation-analysis', element: LazyLoad(SituationAnalysis) },
      { path: 'fraud/text-mining', element: LazyLoad(TextMining) },
      { path: 'fraud/communication-mining', element: LazyLoad(CommunicationMining) },
    ],
  },
];
