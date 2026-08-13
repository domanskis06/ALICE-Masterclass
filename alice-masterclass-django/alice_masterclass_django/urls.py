"""alice_masterclass_django URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/3.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path

from masterclass.views import OAuthAPI, TokenAPI, EventCreateListAPI, EventDeleteAPI, SessionCreateListAPI, SessionDeleteAPI, CheckSessionAPI
from strangeness.views import SubmitVisualAnalysisResultsAPI, GetVisualAnalysisResultsAPI
from strangeness.views import SubmitLargeScaleAnalysisResultsAPI, GetLargeScaleAnalysisResultsAPI
from jpsi.views import SubmitJpsiAnalysisResultsAPI, GetJpsiAnalysisResultsAPI

urlpatterns = [
    path('oauth/', OAuthAPI.as_view()),
    path('api/v1/token/', TokenAPI.as_view()),
    path('api/v1/events/', EventCreateListAPI.as_view()),
    path('api/v1/events/<int:id>/', EventDeleteAPI.as_view()),
    path('api/v1/sessions/', SessionCreateListAPI.as_view()),
    path('api/v1/sessions/<int:id>/', SessionDeleteAPI.as_view()),
    path('api/v1/check_session/', CheckSessionAPI.as_view()),
    path('api/v1/strangeness_visual_analysis/<int:student>/<int:dataset>/', SubmitVisualAnalysisResultsAPI.as_view()),
    path('api/v1/strangeness_visual_analysis_results/<int:id>/', GetVisualAnalysisResultsAPI.as_view()),
    path('api/v1/strangeness_large_scale_analysis/<int:student>/', SubmitLargeScaleAnalysisResultsAPI.as_view()),
    path('api/v1/strangeness_large_scale_analysis_results/<int:id>/', GetLargeScaleAnalysisResultsAPI.as_view()),
    path('api/v1/jpsi_analysis/<int:student>/', SubmitJpsiAnalysisResultsAPI.as_view()),
    path('api/v1/jpsi_analysis_results/<int:id>/', GetJpsiAnalysisResultsAPI.as_view()),
]
