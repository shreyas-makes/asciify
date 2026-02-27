# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Home", type: :request do
  describe "GET /" do
    it "returns success for guests" do
      get root_url

      expect(response).to have_http_status(:success)
    end

    it "returns success for signed-in users" do
      sign_in_as create(:user)

      get root_url

      expect(response).to have_http_status(:success)
    end
  end
end
