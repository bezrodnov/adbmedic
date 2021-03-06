import { createStore, applyMiddleware, compose, combineReducers } from "redux";
import thunk from "redux-thunk";
import axios from "axios";
import { connect } from "react-redux";

import ModelList from "./components/ModelList";

const composeLeft = (...fns) => args => fns.reduce((d, fn) => fn(d), args);

class StoreManager {
  entities = {};

  addEntity({ name, reducer, actionTypes, actions, roles }) {
    if (this.entities[name]) {
      console.error(`entity ${name} has aleady been added, ignoring...`);
      return;
    }
    this.store = null;

    this.entities[name] = { reducer, actions, roles, actionTypes };
  }

  addModel({ name, fields, roles, modelListComponent }) {
    if (this.entities[name]) {
      console.error(`entity ${name} has aleady been added, ignoring...`);
      return;
    }
    this.store = null;

    this.entities[name] = composeLeft(
      generateActionTypes,
      generateActions,
      generateReducer
    )({
      _isModel: true,
      name,
      fields,
      roles,
      modelListComponent
    });
  }

  // TODO: refactor: move somewhere else
  getRoutes(role) {
    const generateModelListComponent = model => {
      const { name, createAction, updateAction, deleteAction, fields } = model;

      const mapChildModels = state =>
        fields
          .filter(field => field.type === "Embedded")
          .reduce((childModels, field) => {
            const childModel = Object.values(this.entities).find(
              entity => entity._isModel && entity.name === field.ref
            );
            if (childModel) {
              childModels[childModel.name] = state[childModel.name];
            }
            return childModels;
          }, {});

      const mapStateToProps = state => ({
        modelName: name,
        settings: state["settings"],
        model: state[name],
        childModels: mapChildModels(state),
        fields
      });
      const mapDispatchToProps = { createAction, updateAction, deleteAction };

      return connect(
        mapStateToProps,
        mapDispatchToProps
      )(model.modelListComponent || ModelList);
    };

    return Object.values(this.entities)
      .filter(
        entity =>
          entity._isModel && (!entity.roles || entity.roles.indexOf(role) >= 0)
      )
      .map(model => ({
        path: `/${model.name}s`,
        component: generateModelListComponent(model)
      }));
  }

  getStore() {
    if (this.store) {
      return this.store;
    }

    const middleware = [thunk];

    const reducers = Object.keys(this.entities).reduce((r, name) => {
      r[name] = this.entities[name].reducer;
      return r;
    }, {});

    this.store = createStore(
      combineReducers(reducers),
      {}, // initial state
      // prettier-ignore
      compose(
        applyMiddleware(...middleware)
        //,window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__()
      )
    );

    Object.values(this.entities).forEach(entity => {
      // TODO: add config to skip loading by default for some models
      if (entity.loadAction) {
        this.store.dispatch(entity.loadAction());
      }
    });

    return this.store;
  }
}

export default StoreManager;

const generateActionTypes = cfg => ({
  ...cfg,
  createActionType: `ADD_${cfg.name.toUpperCase()}`,
  deleteActionType: `DELETE_${cfg.name.toUpperCase()}`,
  updateActionType: `UPDATE_${cfg.name.toUpperCase()}`,
  loadActionType: `LOAD_${cfg.name.toUpperCase()}`,
  setLoadingActionType: `SET_${cfg.name.toUpperCase()}_LOADING`
});

const generateActions = cfg => {
  const createAction = model => dispatch => {
    axios
      .post(`/api/${cfg.name}s`, model)
      .then(res => {
        dispatch({
          type: cfg.createActionType,
          payload: res.data
        });
      })
      .catch(e => {
        console.error(`failed to create new ${cfg.name}`, e, model);
      });
  };

  const updateAction = model => dispatch => {
    axios
      .post(`/api/${cfg.name}s`, model)
      .then(res => {
        dispatch({
          type: cfg.updateActionType,
          payload: res.data
        });
      })
      .catch(e => {
        console.error(`failed to update ${cfg.name}`, e, model);
      });
  };

  const deleteAction = id => dispatch => {
    axios
      .delete(`/api/${cfg.name}s/${id}`)
      .then(res => {
        dispatch({
          type: cfg.deleteActionType,
          payload: id
        });
      })
      .catch(e => {
        console.error(`failed to delete ${cfg.name} by id ${id}`, e);
      });
  };

  const setLoadingAction = () => ({ type: cfg.setLoadingActionType });

  const loadAction = () => dispatch => {
    dispatch(setLoadingAction());
    axios
      .get(`/api/${cfg.name}s`)
      .then(res =>
        dispatch({
          type: cfg.loadActionType,
          payload: res.data
        })
      )
      .catch(e => {
        console.error(`failed to load ${cfg.name}s`, e);
      });
  };

  return {
    ...cfg,
    createAction,
    updateAction,
    deleteAction,
    loadAction,
    setLoadingAction
  };
};

const generateReducer = cfg => {
  const initialState = {
    items: [],
    loading: false
  };

  return {
    ...cfg,
    reducer: (state = initialState, action) => {
      switch (action.type) {
        case cfg.createActionType:
          return {
            ...state,
            items: [action.payload, ...state.items]
          };

        case cfg.updateActionType:
          return {
            ...state,
            items: state.items.map(m =>
              m._id === action.payload._id ? action.payload : m
            )
          };

        case cfg.deleteActionType:
          return {
            ...state,
            items: state.items.filter(m => m._id !== action.payload)
          };

        case cfg.loadActionType:
          return {
            ...state,
            loading: false,
            items: action.payload
          };

        case cfg.setLoadingActionType:
          return {
            ...state,
            loading: true
          };

        default:
          return state;
      }
    }
  };
};
