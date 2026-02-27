# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Users", type: :request do
  describe "GET /sign_up" do
    it "returns http success" do
      get sign_up_url
      expect(response).to have_http_status(:success)
    end
  end

  describe "POST /sign_up" do
    it "creates a new user and redirects to the root url" do
      expect { post sign_up_url, params: attributes_for(:user) }.to change(User, :count).by(1)

      expect(response).to redirect_to(dashboard_url)
    end

    it "redirects to return_to when provided" do
      expect {
        post sign_up_url, params: attributes_for(:user).merge(return_to: "/?claim_draft=1")
      }.to change(User, :count).by(1)

      expect(response).to redirect_to("/?claim_draft=1")
    end
  end
end
